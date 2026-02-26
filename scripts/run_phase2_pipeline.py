from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import get_settings
from app.crawler.arxiv_crawler import ArxivCrawler
from app.crawler.pipeline import CrawlerPipeline
from app.db.milvus import ensure_milvus_collections, get_milvus
from app.db.session import close_db, get_session_factory, init_db


async def main() -> None:
    settings = get_settings()
    await init_db()
    try:
        client = get_milvus()
        created = ensure_milvus_collections(client)
        if created:
            print(f"[phase2] Milvus collections created: {', '.join(created)}")
        else:
            print("[phase2] Milvus collections already exist.")

        crawler = ArxivCrawler()
        records = await crawler.fetch_metadata(
            categories=settings.arxiv_category_list,
            max_results=settings.arxiv_batch_size,
        )
        raw_count = len(records)
        unique_count = len({str(record.get("arxiv_id", "")).strip() for record in records if record.get("arxiv_id")})
        print(f"[phase2] Crawled metadata records (raw): {raw_count}")
        print(f"[phase2] Crawled metadata records (unique): {unique_count}")

        session_factory = get_session_factory()
        async with session_factory() as db:
            pipeline = CrawlerPipeline(db)
            await pipeline.acquire_pipeline_lock()
            upserted, paper_ids = await pipeline.ingest_metadata(records)
            embedded = await pipeline.generate_abstract_embeddings(paper_ids=paper_ids)
            await db.commit()
        print(f"[phase2] Upserted papers: {upserted}")
        print(f"[phase2] Embedded abstracts: {embedded}")
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
