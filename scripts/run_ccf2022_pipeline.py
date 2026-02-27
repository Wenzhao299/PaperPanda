from __future__ import annotations

import asyncio
import os
import sys
from datetime import date
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv

from app.crawler.ccf_dblp_crawler import CCFDblpCrawler
from app.crawler.pipeline import CrawlerPipeline
from app.db.milvus import ensure_milvus_collections, get_milvus
from app.db.session import close_db, get_session_factory, init_db


def _print_translate_progress(done: int, total: int) -> None:
    if total <= 0:
        print("[ccf2022] Translating metadata: 0/0")
        return
    width = 28
    ratio = min(max(done / total, 0.0), 1.0)
    filled = int(width * ratio)
    bar = "#" * filled + "-" * (width - filled)
    percent = int(ratio * 100)
    print(f"\r[ccf2022] Translating metadata: [{bar}] {done}/{total} ({percent:3d}%)", end="", flush=True)
    if done >= total:
        print()


def _parse_domain_filter() -> set[str] | None:
    raw = os.getenv("CCF_DOMAINS", "").strip()
    if not raw:
        return None
    values = {item.strip().lower() for item in raw.split(",") if item.strip()}
    return values or None


async def main() -> None:
    load_dotenv(ROOT_DIR / ".env", override=False)

    year_from = int(os.getenv("CCF_YEAR_FROM", "2020"))
    year_to = int(os.getenv("CCF_YEAR_TO", str(date.today().year)))
    if year_to < year_from:
        year_to = year_from

    detail_fetch_concurrency = int(os.getenv("CCF_DETAIL_FETCH_CONCURRENCY", "4"))
    detail_batch_size = int(os.getenv("CCF_DETAIL_BATCH_SIZE", "120"))
    max_detail_urls = int(os.getenv("CCF_MAX_DETAIL_URLS", "2"))
    request_max_retries = int(os.getenv("CCF_REQUEST_MAX_RETRIES", "5"))
    request_backoff_sec = float(os.getenv("CCF_REQUEST_BACKOFF_SEC", "1.0"))
    venue_request_delay_sec = float(os.getenv("CCF_VENUE_DELAY_SEC", "0.35"))

    resource_file = os.getenv("CCF_RESOURCE_FILE", "resources/ccf-2022-a-security-graphics-ai.md").strip()
    resource_path = Path(resource_file)
    if not resource_path.is_absolute():
        resource_path = ROOT_DIR / resource_path
    if not resource_path.exists():
        raise FileNotFoundError(f"CCF resource file not found: {resource_path}")

    await init_db()
    try:
        client = get_milvus()
        created = ensure_milvus_collections(client)
        if created:
            print(f"[ccf2022] Milvus collections created: {', '.join(created)}")
        else:
            print("[ccf2022] Milvus collections already exist.")

        crawler = CCFDblpCrawler(
            detail_fetch_concurrency=detail_fetch_concurrency,
            detail_batch_size=detail_batch_size,
            max_detail_urls=max_detail_urls,
            request_max_retries=request_max_retries,
            request_backoff_sec=request_backoff_sec,
            venue_request_delay_sec=venue_request_delay_sec,
        )
        venues = crawler.parse_venues(resource_path)
        domain_filter = _parse_domain_filter()
        if domain_filter is not None:
            venues = [venue for venue in venues if venue.domain in domain_filter]
        if not venues:
            print("[ccf2022] No venues matched current filter, skip.")
            return

        conference_count = sum(1 for venue in venues if venue.venue_type == "conference")
        journal_count = sum(1 for venue in venues if venue.venue_type == "journal")
        print(
            "[ccf2022] Venues selected: "
            f"{len(venues)} (conference={conference_count}, journal={journal_count}), "
            f"years={year_from}-{year_to}"
        )
        print(
            "[ccf2022] Request policy: "
            f"retries={request_max_retries}, backoff={request_backoff_sec}s, "
            f"venue_delay={venue_request_delay_sec}s, detail_concurrency={detail_fetch_concurrency}"
        )

        records = await crawler.fetch_metadata(
            venues=venues,
            year_from=year_from,
            year_to=year_to,
        )
        raw_count = len(records)
        unique_count = len({str(record.get("arxiv_id", "")).strip() for record in records if record.get("arxiv_id")})
        print(f"[ccf2022] Crawled metadata records (raw): {raw_count}")
        print(f"[ccf2022] Crawled metadata records (unique): {unique_count}")
        if raw_count <= 0:
            print("[ccf2022] No metadata fetched, skip ingest/embedding/translation.")
            return

        session_factory = get_session_factory()
        async with session_factory() as db:
            pipeline = CrawlerPipeline(db)
            await pipeline.acquire_pipeline_lock()
            upserted, paper_ids = await pipeline.ingest_metadata(records)
            embedded = await pipeline.generate_abstract_embeddings(paper_ids=paper_ids)
            await db.commit()
            translated = await pipeline.translate_missing_metadata(
                paper_ids=None,
                progress_callback=_print_translate_progress,
            )

        print(f"[ccf2022] Upserted papers: {upserted}")
        print(f"[ccf2022] Embedded vectors: {embedded}")
        print(f"[ccf2022] Translated metadata: {translated}")
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
