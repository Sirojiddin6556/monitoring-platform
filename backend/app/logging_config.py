"""Structured logging configuration with optional Sentry integration."""
import os
import json
import logging
import logging.config
import traceback
from datetime import datetime, timezone


class _JsonFormatter(logging.Formatter):
    """JSON log formatter for log aggregation systems (ELK, Loki, etc.)."""

    def format(self, record: logging.LogRecord) -> str:
        data: dict = {
            "ts": datetime.now(tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            data["exc"] = "".join(traceback.format_exception(*record.exc_info)).strip()
        if hasattr(record, "request_id"):
            data["request_id"] = record.request_id
        if hasattr(record, "user_id"):
            data["user_id"] = record.user_id
        return json.dumps(data, ensure_ascii=False)


def configure_logging() -> None:
    """Configure structured logging + optional Sentry. Call once at startup."""
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    log_format = os.getenv("LOG_FORMAT", "text").lower()

    formatter_class = "app.logging_config._JsonFormatter" if log_format == "json" else None

    handler_config: dict = {
        "class": "logging.StreamHandler",
        "stream": "ext://sys.stdout",
    }
    if formatter_class:
        handler_config["formatter"] = "json"
    else:
        handler_config["formatter"] = "standard"

    logging.config.dictConfig({
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "json": {
                "()": _JsonFormatter,
            },
            "standard": {
                "format": "%(asctime)s [%(levelname)-8s] %(name)s: %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
        },
        "handlers": {
            "console": handler_config,
        },
        "loggers": {
            "backend": {"level": log_level, "handlers": ["console"], "propagate": False},
            "app": {"level": log_level, "handlers": ["console"], "propagate": False},
            "uvicorn": {"level": "INFO", "handlers": ["console"], "propagate": False},
            "uvicorn.access": {"level": "WARNING", "handlers": ["console"], "propagate": False},
            "sqlalchemy.engine": {"level": "WARNING", "handlers": ["console"], "propagate": False},
            "celery": {"level": "INFO", "handlers": ["console"], "propagate": False},
        },
        "root": {"level": log_level, "handlers": ["console"]},
    })

    _init_sentry()


def _init_sentry() -> None:
    sentry_dsn = os.getenv("SENTRY_DSN", "").strip()
    if not sentry_dsn:
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration

        sentry_sdk.init(
            dsn=sentry_dsn,
            environment=os.getenv("ENVIRONMENT", "production"),
            release=os.getenv("APP_VERSION", "unknown"),
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                SqlalchemyIntegration(),
                LoggingIntegration(level=logging.WARNING, event_level=logging.ERROR),
            ],
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            profiles_sample_rate=float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0.0")),
        )
        logging.getLogger("app").info("Sentry initialized (dsn=***)")
    except ImportError:
        logging.getLogger("app").info("sentry-sdk not installed — Sentry disabled")
    except Exception as e:
        logging.getLogger("app").warning("Sentry init failed: %s", e)
