from __future__ import annotations

from app.tasks.celery_app import celery_app
from app.tasks.crawl_tasks import task_crawl_and_embed_metadata


@celery_app.task(name="task_daily_sync")
def task_daily_sync() -> str:
    result = task_crawl_and_embed_metadata.run()
    return f"daily sync done: {result}"
