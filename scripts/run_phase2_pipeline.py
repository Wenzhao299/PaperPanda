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


def _print_translate_progress(done: int, total: int) -> None:
    if total <= 0:
        print("[phase2] Translating metadata: 0/0")
        return
    width = 28
    ratio = min(max(done / total, 0.0), 1.0)
    filled = int(width * ratio)
    bar = "#" * filled + "-" * (width - filled)
    percent = int(ratio * 100)
    print(f"\r[phase2] Translating metadata: [{bar}] {done}/{total} ({percent:3d}%)", end="", flush=True)
    if done >= total:
        print()


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

        session_factory = get_session_factory()
        async with session_factory() as db:
            pipeline = CrawlerPipeline(db)
            await pipeline.acquire_pipeline_lock()
            since_map = await pipeline.get_category_since_map(settings.arxiv_category_list)
            if since_map:
                checkpoints = ", ".join(f"{key}:{value.isoformat()}" for key, value in since_map.items())
                print(f"[phase2] Incremental checkpoints: {checkpoints}")
            else:
                print("[phase2] Incremental checkpoints: (empty, full fetch within configured limit)")

            crawler = ArxivCrawler()
            records = await crawler.fetch_metadata(
                categories=settings.arxiv_category_list,
                max_results=settings.arxiv_max_results_per_category,
                since_by_category=since_map,
            )
            raw_count = len(records)
            unique_count = len({str(record.get("arxiv_id", "")).strip() for record in records if record.get("arxiv_id")})
            print(f"[phase2] Crawled metadata records (raw): {raw_count}")
            print(f"[phase2] Crawled metadata records (unique): {unique_count}")

            upserted, paper_ids = await pipeline.ingest_metadata(records)
            embedded = await pipeline.generate_abstract_embeddings(paper_ids=paper_ids)
            await db.commit()
            translated = await pipeline.translate_missing_metadata(
                paper_ids=None,
                progress_callback=_print_translate_progress,
            )
        print(f"[phase2] Upserted papers: {upserted}")
        print(f"[phase2] Embedded abstracts: {embedded}")
        print(f"[phase2] Translated metadata: {translated}")
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
