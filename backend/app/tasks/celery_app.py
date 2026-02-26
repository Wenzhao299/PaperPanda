from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.config import get_settings

settings = get_settings()

celery_app = Celery("paperpanda", broker=settings.celery_broker, backend=settings.celery_backend)
celery_app.conf.update(
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    beat_schedule={
        "daily-crawl-sync": {
            "task": "task_daily_sync",
            "schedule": crontab(minute=0, hour=2),
        }
    },
)
