"""Celery background tasks for monitoring platform."""
import os
import datetime
import logging

from .celery_app import celery_app

logger = logging.getLogger("backend.tasks")

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data/monitoring.db")


def _get_sync_session():
    """Create a synchronous SQLAlchemy session for Celery tasks."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    sync_url = DATABASE_URL.replace("+aiosqlite", "").replace("+asyncpg", "")
    engine = create_engine(sync_url)
    Session = sessionmaker(bind=engine)
    return Session()


@celery_app.task(name="app.tasks.check_websites", bind=True, max_retries=3)
def check_websites(self):
    """Probe all websites and store results in DB."""
    import httpx
    from sqlalchemy import select as sa_select
    from .models import Website as WebsiteModel, Probe as ProbeModel

    session = _get_sync_session()
    try:
        websites = session.execute(sa_select(WebsiteModel)).scalars().all()
        now = datetime.datetime.utcnow()
        for ws in websites:
            if not ws.url:
                continue
            try:
                with httpx.Client(timeout=10, follow_redirects=True) as client:
                    import time
                    start = time.time()
                    resp = client.get(ws.url)
                    elapsed_ms = round((time.time() - start) * 1000, 2)
                    status = "up" if resp.status_code < 400 else "degraded"
                    status_code = resp.status_code
            except Exception as e:
                elapsed_ms = None
                status = "down"
                status_code = None

            probe = ProbeModel(
                website_id=ws.id,
                target_url=ws.url,
                payload={
                    "website_id": ws.id,
                    "target": ws.url,
                    "status": status,
                    "status_code": status_code,
                    "response_time": elapsed_ms,
                    "timestamp": int(datetime.datetime.utcnow().timestamp()),
                },
                received_at=now,
            )
            session.add(probe)
        session.commit()
        return {"checked": len(websites)}
    except Exception as exc:
        session.rollback()
        logger.exception("check_websites failed")
        raise self.retry(exc=exc, countdown=10)
    finally:
        session.close()


@celery_app.task(name="app.tasks.ping_servers", bind=True, max_retries=3)
def ping_servers(self):
    """Ping all servers via ICMP/TCP and store metric rows."""
    import subprocess
    import platform
    import time
    from sqlalchemy import select as sa_select
    from .models import Server as ServerModel, Metric as MetricModel

    session = _get_sync_session()
    try:
        servers = session.execute(sa_select(ServerModel)).scalars().all()
        now = datetime.datetime.utcnow()
        results = []
        for srv in servers:
            if not srv.host:
                continue
            param = "-n" if platform.system().lower() == "windows" else "-c"
            try:
                start = time.time()
                ret = subprocess.run(
                    ["ping", param, "1", "-w", "3000", srv.host],
                    capture_output=True, timeout=6,
                )
                elapsed_ms = round((time.time() - start) * 1000, 2)
                status = "ok" if ret.returncode == 0 else "down"
            except Exception:
                elapsed_ms = None
                status = "down"

            metric = MetricModel(
                server_id=srv.id,
                metric_name="ping",
                payload={
                    "server_id": srv.id,
                    "metric": "ping",
                    "status": status,
                    "value": elapsed_ms,
                    "timestamp": int(now.timestamp()),
                },
                received_at=now,
            )
            session.add(metric)
            results.append({"server_id": srv.id, "status": status})
        session.commit()
        return {"pinged": len(results)}
    except Exception as exc:
        session.rollback()
        logger.exception("ping_servers failed")
        raise self.retry(exc=exc, countdown=10)
    finally:
        session.close()


@celery_app.task(name="app.tasks.compute_sla_records")
def compute_sla_records():
    """Compute hourly SLA records from metrics/probes tables."""
    from sqlalchemy import select as sa_select, func
    from .models import (
        Server as ServerModel, Website as WebsiteModel,
        Metric as MetricModel, Probe as ProbeModel,
        SLARecord,
    )

    session = _get_sync_session()
    try:
        now = datetime.datetime.utcnow().replace(minute=0, second=0, microsecond=0)
        period_start = now - datetime.timedelta(hours=1)
        period_end = now
        created = 0

        servers = session.execute(sa_select(ServerModel)).scalars().all()
        for srv in servers:
            metrics = session.execute(
                sa_select(MetricModel)
                .where(MetricModel.server_id == srv.id)
                .where(MetricModel.received_at >= period_start)
                .where(MetricModel.received_at < period_end)
            ).scalars().all()
            if not metrics:
                continue
            total = len(metrics)
            ok = sum(1 for m in metrics if (m.payload or {}).get("status") in ("ok", "up"))
            uptime_pct = round(ok / total * 100, 4)
            downtime_min = round((total - ok) * (60 / total), 2) if total else 0
            resp_vals = [
                (m.payload or {}).get("value")
                for m in metrics
                if (m.payload or {}).get("value") is not None
            ]
            avg_resp = round(sum(resp_vals) / len(resp_vals), 2) if resp_vals else None

            record = SLARecord(
                target_type="server",
                target_id=srv.id,
                period_start=period_start,
                period_end=period_end,
                uptime_pct=uptime_pct,
                downtime_minutes=downtime_min,
                checks_total=total,
                checks_ok=ok,
                avg_response_ms=avg_resp,
            )
            session.add(record)
            created += 1

        websites = session.execute(sa_select(WebsiteModel)).scalars().all()
        for ws in websites:
            probes = session.execute(
                sa_select(ProbeModel)
                .where(ProbeModel.website_id == ws.id)
                .where(ProbeModel.received_at >= period_start)
                .where(ProbeModel.received_at < period_end)
            ).scalars().all()
            if not probes:
                continue
            total = len(probes)
            ok = sum(1 for p in probes if (p.payload or {}).get("status") in ("up", "ok"))
            uptime_pct = round(ok / total * 100, 4)
            downtime_min = round((total - ok) * (60 / total), 2) if total else 0
            resp_vals = [
                (p.payload or {}).get("response_time")
                for p in probes
                if (p.payload or {}).get("response_time") is not None
            ]
            avg_resp = round(sum(resp_vals) / len(resp_vals), 2) if resp_vals else None

            record = SLARecord(
                target_type="website",
                target_id=ws.id,
                period_start=period_start,
                period_end=period_end,
                uptime_pct=uptime_pct,
                downtime_minutes=downtime_min,
                checks_total=total,
                checks_ok=ok,
                avg_response_ms=avg_resp,
            )
            session.add(record)
            created += 1

        session.commit()
        return {"created_records": created, "period_start": period_start.isoformat()}
    except Exception:
        session.rollback()
        logger.exception("compute_sla_records failed")
        raise
    finally:
        session.close()


@celery_app.task(name="app.tasks.cleanup_old_data")
def cleanup_old_data():
    """Delete metrics/probes/logs older than data_retention_hours setting."""
    from sqlalchemy import select as sa_select, delete as sa_delete
    from .models import Metric as MetricModel, Probe as ProbeModel, Log as LogModel, Setting as SettingModel

    session = _get_sync_session()
    try:
        res = session.execute(
            sa_select(SettingModel).where(SettingModel.key == "data_retention_hours")
        ).scalars().first()
        retention_hours = int(res.value) if res and res.value else 168
        if retention_hours == 0:
            return {"deleted": 0, "message": "Retention disabled"}

        cutoff = datetime.datetime.utcnow() - datetime.timedelta(hours=retention_hours)
        total_deleted = 0

        for model in (MetricModel, ProbeModel, LogModel):
            result = session.execute(
                sa_delete(model).where(model.received_at < cutoff)
            )
            total_deleted += result.rowcount

        session.commit()
        return {"deleted": total_deleted, "cutoff": cutoff.isoformat()}
    except Exception:
        session.rollback()
        logger.exception("cleanup_old_data failed")
        raise
    finally:
        session.close()


@celery_app.task(name="app.tasks.send_notification")
def send_notification(channel_type: str, config: dict, alert_dict: dict):
    """Dispatch a notification via specified channel (called by alert engine)."""
    import httpx

    title = alert_dict.get("title", "Alert")
    message = alert_dict.get("message", "")
    severity = alert_dict.get("severity", "info").upper()
    target = alert_dict.get("target_name", "")
    text = f"[{severity}] {title}\n{message}"
    if target:
        text += f"\nTarget: {target}"

    try:
        if channel_type == "webhook":
            url = config.get("url", "")
            if url:
                headers = config.get("headers", {})
                headers.setdefault("Content-Type", "application/json")
                with httpx.Client(timeout=10) as client:
                    client.post(url, json=alert_dict, headers=headers)

        elif channel_type == "discord":
            webhook_url = config.get("webhook_url", "")
            if webhook_url:
                color_map = {"CRITICAL": 0xFF0000, "WARNING": 0xFFA500, "INFO": 0x00BFFF}
                color = color_map.get(severity, 0x00BFFF)
                with httpx.Client(timeout=10) as client:
                    client.post(webhook_url, json={
                        "embeds": [{
                            "title": f"[{severity}] {title}",
                            "description": message,
                            "color": color,
                        }]
                    })
    except Exception:
        logger.exception("send_notification failed for channel_type=%s", channel_type)
