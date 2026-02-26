from __future__ import annotations

import asyncio

from app.crawler.pipeline import CrawlerPipeline
from app.db.session import close_db, get_session_factory, init_db
from app.tasks.celery_app import celery_app


async def _run_generate_embeddings(limit: int = 200) -> int:
    await init_db()
    try:
        session_factory = get_session_factory()
        async with session_factory() as db:
            pipeline = CrawlerPipeline(db)
            count = await pipeline.generate_abstract_embeddings(limit=limit)
            await db.commit()
            return count
    finally:
        await close_db()


@celery_app.task(name="task_generate_embeddings")
def task_generate_embeddings(limit: int = 200) -> str:
    embedded = asyncio.run(_run_generate_embeddings(limit=limit))
    return f"embedding completed, embedded={embedded}"
