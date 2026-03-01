import os
from celery import Celery
from app.core.config import settings
from datetime import timedelta

# Initialize Celery
# If REDIS_URL is not set, we default to localhost Redis, but this will fail gracefully if Redis is entirely absent
redis_url = settings.REDIS_URL or "redis://localhost:6379/0"

celery_app = Celery(
    "screening_worker",
    broker=redis_url,
    backend=redis_url,
    include=["app.worker.tasks"]
)

# Optional configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Paris",
    enable_utc=True,
    # Configure Beat Scheduler
    beat_schedule={
        "fetch-wttj-jobs-every-6-hours": {
            "task": "app.worker.tasks.fetch_wttj_jobs",
            "schedule": timedelta(hours=6),
        },
        "fetch-francetravail-jobs-every-6-hours": {
            "task": "app.worker.tasks.fetch_francetravail_jobs",
            "schedule": timedelta(hours=6),
        },
    }
)
