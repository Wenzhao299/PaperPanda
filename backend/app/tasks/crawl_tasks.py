from __future__ import annotations

import asyncio

from app.config import get_settings
from app.crawler.arxiv_crawler import ArxivCrawler
from app.crawler.pipeline import CrawlerPipeline
from app.db.session import close_db, get_session_factory, init_db
from app.tasks.celery_app import celery_app


async def _run_crawl_metadata() -> tuple[int, int]:
    settings = get_settings()
    await init_db()
    try:
        session_factory = get_session_factory()
        async with session_factory() as db:
            pipeline = CrawlerPipeline(db)
            await pipeline.acquire_pipeline_lock()
            since_map = await pipeline.get_category_since_map(settings.arxiv_category_list)
            crawler = ArxivCrawler()
            records = await crawler.fetch_metadata(
                categories=settings.arxiv_category_list,
                max_results=settings.arxiv_max_results_per_category,
                since_by_category=since_map,
            )
            upserted, _paper_ids = await pipeline.ingest_metadata(records)
            await db.commit()
            translated = await pipeline.translate_missing_metadata(paper_ids=None)
            return upserted, translated
    finally:
        await close_db()


async def _run_crawl_and_embed_metadata() -> tuple[int, int, int, int]:
    settings = get_settings()
    await init_db()
    try:
        session_factory = get_session_factory()
        async with session_factory() as db:
            pipeline = CrawlerPipeline(db)
            await pipeline.acquire_pipeline_lock()
            since_map = await pipeline.get_category_since_map(settings.arxiv_category_list)
            crawler = ArxivCrawler()
            records = await crawler.fetch_metadata(
                categories=settings.arxiv_category_list,
                max_results=settings.arxiv_max_results_per_category,
                since_by_category=since_map,
            )
            upserted, paper_ids = await pipeline.ingest_metadata(records)
            embedded = await pipeline.generate_abstract_embeddings(paper_ids=paper_ids)
            await db.commit()
            translated = await pipeline.translate_missing_metadata(paper_ids=None)
            return len(records), upserted, embedded, translated
    finally:
        await close_db()


@celery_app.task(name="task_crawl_metadata")
def task_crawl_metadata() -> str:
    upserted, translated = asyncio.run(_run_crawl_metadata())
    return f"crawl completed, upserted={upserted}, translated={translated}"


@celery_app.task(name="task_crawl_and_embed_metadata")
def task_crawl_and_embed_metadata() -> str:
    crawled, upserted, embedded, translated = asyncio.run(_run_crawl_and_embed_metadata())
    return f"crawl+embed completed, crawled={crawled}, upserted={upserted}, embedded={embedded}, translated={translated}"
