from __future__ import annotations

import asyncio

from app.config import get_settings
from app.crawler.arxiv_crawler import ArxivCrawler
from app.crawler.pipeline import CrawlerPipeline
from app.db.session import close_db, get_session_factory, init_db
from app.tasks.celery_app import celery_app


async def _run_crawl_metadata() -> int:
    settings = get_settings()
    await init_db()
    try:
        crawler = ArxivCrawler()
        records = await crawler.fetch_metadata(
            categories=settings.arxiv_category_list,
            max_results=settings.arxiv_batch_size,
        )
        session_factory = get_session_factory()
        async with session_factory() as db:
            pipeline = CrawlerPipeline(db)
            await pipeline.acquire_pipeline_lock()
            upserted, _ = await pipeline.ingest_metadata(records)
            await db.commit()
            return upserted
    finally:
        await close_db()


async def _run_crawl_and_embed_metadata() -> tuple[int, int, int]:
    settings = get_settings()
    await init_db()
    try:
        crawler = ArxivCrawler()
        records = await crawler.fetch_metadata(
            categories=settings.arxiv_category_list,
            max_results=settings.arxiv_batch_size,
        )
        session_factory = get_session_factory()
        async with session_factory() as db:
            pipeline = CrawlerPipeline(db)
            await pipeline.acquire_pipeline_lock()
            upserted, paper_ids = await pipeline.ingest_metadata(records)
            embedded = await pipeline.generate_abstract_embeddings(paper_ids=paper_ids)
            await db.commit()
            return len(records), upserted, embedded
    finally:
        await close_db()


@celery_app.task(name="task_crawl_metadata")
def task_crawl_metadata() -> str:
    upserted = asyncio.run(_run_crawl_metadata())
    return f"crawl completed, upserted={upserted}"


@celery_app.task(name="task_crawl_and_embed_metadata")
def task_crawl_and_embed_metadata() -> str:
    crawled, upserted, embedded = asyncio.run(_run_crawl_and_embed_metadata())
    return f"crawl+embed completed, crawled={crawled}, upserted={upserted}, embedded={embedded}"
