from __future__ import annotations

from app.tasks.celery_app import celery_app
from app.tasks.crawl_tasks import task_crawl_metadata
from app.tasks.embedding_tasks import task_generate_embeddings


@celery_app.task(name="task_daily_sync")
def task_daily_sync() -> str:
    crawl_result = task_crawl_metadata.run()
    embedding_result = task_generate_embeddings.run(limit=500)
    return f"daily sync done: {crawl_result}; {embedding_result}"
