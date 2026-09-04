"""Celery application factory."""
import os
from celery import Celery
from celery.schedules import crontab

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "monitoring",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    result_expires=3600,
    beat_schedule={
        "check-websites-every-30s": {
            "task": "app.tasks.check_websites",
            "schedule": 30.0,
        },
        "ping-servers-every-15s": {
            "task": "app.tasks.ping_servers",
            "schedule": 15.0,
        },
        "compute-sla-hourly": {
            "task": "app.tasks.compute_sla_records",
            "schedule": crontab(minute=5),
        },
        "cleanup-old-data-daily": {
            "task": "app.tasks.cleanup_old_data",
            "schedule": crontab(hour=3, minute=0),
        },
    },
)
