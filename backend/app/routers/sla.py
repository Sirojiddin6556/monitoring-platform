_SLA_SUMMARY_CACHE = None
_SLA_SUMMARY_CACHE_TIME = 0
_SLA_CACHE_TTL = 300  # seconds

"""SLA / Uptime tracker router — Sprint 3.

SLA records are computed hourly by Celery. This router provides query endpoints.
"""
import logging
import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select, func, text

from .. import db
from ..models import (
    SLARecord, Server as ServerModel, Website as WebsiteModel,
    Metric as MetricModel, Probe as ProbeModel,
)
from ..security import get_current_user

logger = logging.getLogger("backend.sla")

router = APIRouter(prefix="/api/sla", tags=["sla"])


def _uptime_color(pct: Optional[float]) -> str:
    if pct is None:
        return "gray"
    if pct >= 99.9:
        return "green"
    if pct >= 99.0:
        return "yellow"
    return "red"


@router.get("/summary")
async def sla_summary(
    org_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
):
    """SLA summary for all servers and websites (30d, 7d, 24h). Cached for 60s."""
    global _SLA_SUMMARY_CACHE, _SLA_SUMMARY_CACHE_TIME
    now = datetime.datetime.utcnow()
    now_ts = now.timestamp()

    # Serve from cache if available and fresh (for default all-orgs view)
    if org_id is None and _SLA_SUMMARY_CACHE and (now_ts - _SLA_SUMMARY_CACHE_TIME) < _SLA_CACHE_TTL:
        return _SLA_SUMMARY_CACHE
    since_30d = now - datetime.timedelta(days=30)
    since_7d = now - datetime.timedelta(days=7)
    since_24h = now - datetime.timedelta(hours=24)

    role = current_user.get("role")
    user_org_ids = current_user.get("org_ids", [])

    async with db.get_session() as session:
        # Collect servers
        srv_q = select(ServerModel)
        if role != "admin" and user_org_ids:
            srv_q = srv_q.where(ServerModel.org_id.in_(user_org_ids))
        elif org_id:
            srv_q = srv_q.where(ServerModel.org_id == org_id)
        servers = (await session.execute(srv_q)).scalars().all()

        # Collect websites
        ws_q = select(WebsiteModel)
        if role != "admin" and user_org_ids:
            ws_q = ws_q.where(WebsiteModel.org_id.in_(user_org_ids))
        elif org_id:
            ws_q = ws_q.where(WebsiteModel.org_id == org_id)
        websites = (await session.execute(ws_q)).scalars().all()

        result = []

        for srv in servers:
            uptime_30d, uptime_7d, uptime_24h = await _compute_server_uptimes(
                session, srv.id, since_30d, since_7d, since_24h, now
            )
            result.append({
                "target_type": "server",
                "target_id": srv.id,
                "target_name": srv.name,
                "org_id": srv.org_id,
                "uptime_30d": uptime_30d,
                "uptime_7d": uptime_7d,
                "uptime_24h": uptime_24h,
                "color_30d": _uptime_color(uptime_30d),
            })

        for ws in websites:
            uptime_30d, uptime_7d, uptime_24h = await _compute_website_uptimes(
                session, ws.id, since_30d, since_7d, since_24h, now
            )
            result.append({
                "target_type": "website",
                "target_id": ws.id,
                "target_name": ws.name,
                "org_id": ws.org_id,
                "uptime_30d": uptime_30d,
                "uptime_7d": uptime_7d,
                "uptime_24h": uptime_24h,
                "color_30d": _uptime_color(uptime_30d),
            })

        resp_data = {"summary": result, "generated_at": now.isoformat()}
        if org_id is None:
            _SLA_SUMMARY_CACHE = resp_data
            _SLA_SUMMARY_CACHE_TIME = now_ts
        return resp_data


@router.get("/{target_type}/{target_id}")
async def sla_for_target(
    target_type: str,
    target_id: str,
    days: int = 30,
    current_user: dict = Depends(get_current_user),
):
    """SLA history records for a specific server or website."""
    if target_type not in ("server", "website"):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="target_type must be 'server' or 'website'")

    since = datetime.datetime.utcnow() - datetime.timedelta(days=min(days, 365))

    async with db.get_session() as session:
        res = await session.execute(
            select(SLARecord)
            .where(SLARecord.target_type == target_type)
            .where(SLARecord.target_id == target_id)
            .where(SLARecord.period_start >= since)
            .order_by(SLARecord.period_start.asc())
        )
        records = res.scalars().all()

        history = [
            {
                "period_start": r.period_start.isoformat(),
                "period_end": r.period_end.isoformat(),
                "uptime_pct": r.uptime_pct,
                "downtime_minutes": r.downtime_minutes,
                "checks_total": r.checks_total,
                "checks_ok": r.checks_ok,
                "avg_response_ms": r.avg_response_ms,
            }
            for r in records
        ]

        # Compute aggregated stats over whole period
        if records:
            total_checks = sum(r.checks_total for r in records)
            ok_checks = sum(r.checks_ok for r in records)
            agg_uptime = round(ok_checks / total_checks * 100, 4) if total_checks else None
            total_down = sum(r.downtime_minutes for r in records)
            resp_values = [r.avg_response_ms for r in records if r.avg_response_ms is not None]
            avg_resp = round(sum(resp_values) / len(resp_values), 2) if resp_values else None
        else:
            agg_uptime = None
            total_down = 0
            avg_resp = None

        return {
            "target_type": target_type,
            "target_id": target_id,
            "days": days,
            "aggregated": {
                "uptime_pct": agg_uptime,
                "total_downtime_minutes": total_down,
                "avg_response_ms": avg_resp,
            },
            "history": history,
        }


@router.get("/report")
async def sla_report(
    from_date: str,
    to_date: str,
    org_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
):
    """SLA report for a custom date range."""
    try:
        from_dt = datetime.datetime.fromisoformat(from_date)
        to_dt = datetime.datetime.fromisoformat(to_date)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="from_date and to_date must be ISO 8601 format")

    async with db.get_session() as session:
        q = (
            select(SLARecord)
            .where(SLARecord.period_start >= from_dt)
            .where(SLARecord.period_end <= to_dt)
            .order_by(SLARecord.target_type, SLARecord.target_id, SLARecord.period_start)
        )
        res = await session.execute(q)
        records = res.scalars().all()

        # Group by target
        from collections import defaultdict
        grouped: dict = defaultdict(list)
        for r in records:
            key = (r.target_type, r.target_id)
            grouped[key].append(r)

        report = []
        for (ttype, tid), recs in grouped.items():
            total = sum(r.checks_total for r in recs)
            ok = sum(r.checks_ok for r in recs)
            uptime = round(ok / total * 100, 4) if total else None
            down = sum(r.downtime_minutes for r in recs)
            resp_vals = [r.avg_response_ms for r in recs if r.avg_response_ms is not None]
            avg_resp = round(sum(resp_vals) / len(resp_vals), 2) if resp_vals else None
            report.append({
                "target_type": ttype,
                "target_id": tid,
                "uptime_pct": uptime,
                "total_downtime_minutes": down,
                "avg_response_ms": avg_resp,
                "data_points": len(recs),
            })

        return {
            "from_date": from_date,
            "to_date": to_date,
            "org_id": org_id,
            "report": report,
            "generated_at": datetime.datetime.utcnow().isoformat(),
        }


async def _compute_server_uptimes(
    session, server_id: str, since_30d, since_7d, since_24h, now
) -> tuple[Optional[float], Optional[float], Optional[float]]:
    """Compute 30d, 7d, 24h uptimes in a single fast SQL aggregation query."""
    try:
        q = text("""
            SELECT 
                COUNT(*),
                COUNT(*) FILTER (WHERE (payload ->> 'status') IN ('ok', 'up')),
                COUNT(*) FILTER (WHERE received_at >= :since_7d),
                COUNT(*) FILTER (WHERE received_at >= :since_7d AND (payload ->> 'status') IN ('ok', 'up')),
                COUNT(*) FILTER (WHERE received_at >= :since_24h),
                COUNT(*) FILTER (WHERE received_at >= :since_24h AND (payload ->> 'status') IN ('ok', 'up'))
            FROM metrics
            WHERE server_id = :target_id 
              AND metric_name = 'ping'
              AND received_at >= :since_30d 
              AND received_at <= :now
        """)
        res = await session.execute(q, {
            "target_id": str(server_id),
            "since_30d": since_30d,
            "since_7d": since_7d,
            "since_24h": since_24h,
            "now": now,
        })
        row = res.first()
        if not row:
            return None, None, None
        t30, ok30, t7, ok7, t24, ok24 = row
        u30 = round(ok30 / t30 * 100, 4) if t30 else None
        u7 = round(ok7 / t7 * 100, 4) if t7 else None
        u24 = round(ok24 / t24 * 100, 4) if t24 else None
        return u30, u7, u24
    except Exception:
        # Fallback for SQLite
        try:
            q_fb = text("""
                SELECT 
                    COUNT(*),
                    SUM(CASE WHEN json_extract(payload, '$.status') IN ('ok', 'up') THEN 1 ELSE 0 END),
                    SUM(CASE WHEN received_at >= :since_7d THEN 1 ELSE 0 END),
                    SUM(CASE WHEN received_at >= :since_7d AND json_extract(payload, '$.status') IN ('ok', 'up') THEN 1 ELSE 0 END),
                    SUM(CASE WHEN received_at >= :since_24h THEN 1 ELSE 0 END),
                    SUM(CASE WHEN received_at >= :since_24h AND json_extract(payload, '$.status') IN ('ok', 'up') THEN 1 ELSE 0 END)
                FROM metrics
                WHERE server_id = :target_id 
                  AND received_at >= :since_30d 
                  AND received_at <= :now
            """)
            res = await session.execute(q_fb, {
                "target_id": str(server_id),
                "since_30d": since_30d,
                "since_7d": since_7d,
                "since_24h": since_24h,
                "now": now,
            })
            row = res.first()
            if not row:
                return None, None, None
            t30, ok30, t7, ok7, t24, ok24 = row
            u30 = round(ok30 / t30 * 100, 4) if t30 else None
            u7 = round(ok7 / t7 * 100, 4) if t7 else None
            u24 = round(ok24 / t24 * 100, 4) if t24 else None
            return u30, u7, u24
        except Exception:
            return None, None, None


async def _compute_website_uptimes(
    session, website_id: str, since_30d, since_7d, since_24h, now
) -> tuple[Optional[float], Optional[float], Optional[float]]:
    """Compute 30d, 7d, 24h uptimes for website in a single SQL query."""
    try:
        q = text("""
            SELECT 
                COUNT(*),
                COUNT(*) FILTER (WHERE (payload ->> 'status') IN ('up', 'ok')),
                COUNT(*) FILTER (WHERE received_at >= :since_7d),
                COUNT(*) FILTER (WHERE received_at >= :since_7d AND (payload ->> 'status') IN ('up', 'ok')),
                COUNT(*) FILTER (WHERE received_at >= :since_24h),
                COUNT(*) FILTER (WHERE received_at >= :since_24h AND (payload ->> 'status') IN ('up', 'ok'))
            FROM probes
            WHERE website_id = :website_id 
              AND received_at >= :since_30d 
              AND received_at <= :now
        """)
        res = await session.execute(q, {
            "website_id": str(website_id),
            "since_30d": since_30d,
            "since_7d": since_7d,
            "since_24h": since_24h,
            "now": now,
        })
        row = res.first()
        if not row:
            return None, None, None
        t30, ok30, t7, ok7, t24, ok24 = row
        u30 = round(ok30 / t30 * 100, 4) if t30 else None
        u7 = round(ok7 / t7 * 100, 4) if t7 else None
        u24 = round(ok24 / t24 * 100, 4) if t24 else None
        return u30, u7, u24
    except Exception:
        # Fallback for SQLite
        try:
            q_fb = text("""
                SELECT 
                    COUNT(*),
                    SUM(CASE WHEN json_extract(payload, '$.status') IN ('up', 'ok') THEN 1 ELSE 0 END),
                    SUM(CASE WHEN received_at >= :since_7d THEN 1 ELSE 0 END),
                    SUM(CASE WHEN received_at >= :since_7d AND json_extract(payload, '$.status') IN ('up', 'ok') THEN 1 ELSE 0 END),
                    SUM(CASE WHEN received_at >= :since_24h THEN 1 ELSE 0 END),
                    SUM(CASE WHEN received_at >= :since_24h AND json_extract(payload, '$.status') IN ('up', 'ok') THEN 1 ELSE 0 END)
                FROM probes
                WHERE website_id = :website_id 
                  AND received_at >= :since_30d 
                  AND received_at <= :now
            """)
            res = await session.execute(q_fb, {
                "website_id": str(website_id),
                "since_30d": since_30d,
                "since_7d": since_7d,
                "since_24h": since_24h,
                "now": now,
            })
            row = res.first()
            if not row:
                return None, None, None
            t30, ok30, t7, ok7, t24, ok24 = row
            u30 = round(ok30 / t30 * 100, 4) if t30 else None
            u7 = round(ok7 / t7 * 100, 4) if t7 else None
            u24 = round(ok24 / t24 * 100, 4) if t24 else None
            return u30, u7, u24
        except Exception:
            return None, None, None


async def _compute_uptime(session, target_type: str, target_id: str, since, until) -> Optional[float]:
    """Compute uptime% from metrics table using SQL aggregation."""
    try:
        q = text("""
            SELECT 
                COUNT(*),
                COUNT(*) FILTER (WHERE (payload ->> 'status') IN ('ok', 'up'))
            FROM metrics
            WHERE server_id = :target_id 
              AND metric_name = 'ping'
              AND received_at >= :since 
              AND received_at <= :until
        """)
        res = await session.execute(q, {"target_id": str(target_id), "since": since, "until": until})
        row = res.first()
        if not row or not row[0]:
            return None
        total, ok = row[0], row[1] or 0
        return round(ok / total * 100, 4)
    except Exception:
        try:
            q_fb = text("""
                SELECT 
                    COUNT(*),
                    SUM(CASE WHEN json_extract(payload, '$.status') IN ('ok', 'up') THEN 1 ELSE 0 END)
                FROM metrics
                WHERE server_id = :target_id 
                  AND received_at >= :since 
                  AND received_at <= :until
            """)
            res = await session.execute(q_fb, {"target_id": str(target_id), "since": since, "until": until})
            row = res.first()
            if not row or not row[0]:
                return None
            total, ok = row[0], row[1] or 0
            return round(ok / total * 100, 4)
        except Exception:
            return None


async def _compute_website_uptime(session, website_id: str, since, until) -> Optional[float]:
    """Compute uptime% from probes table using SQL aggregation."""
    try:
        q = text("""
            SELECT 
                COUNT(*),
                COUNT(*) FILTER (WHERE (payload ->> 'status') IN ('up', 'ok'))
            FROM probes
            WHERE website_id = :website_id 
              AND received_at >= :since 
              AND received_at <= :until
        """)
        res = await session.execute(q, {"website_id": str(website_id), "since": since, "until": until})
        row = res.first()
        if not row or not row[0]:
            return None
        total, ok = row[0], row[1] or 0
        return round(ok / total * 100, 4)
    except Exception:
        try:
            q_fb = text("""
                SELECT 
                    COUNT(*),
                    SUM(CASE WHEN json_extract(payload, '$.status') IN ('up', 'ok') THEN 1 ELSE 0 END)
                FROM probes
                WHERE website_id = :website_id 
                  AND received_at >= :since 
                  AND received_at <= :until
            """)
            res = await session.execute(q_fb, {"website_id": str(website_id), "since": since, "until": until})
            row = res.first()
            if not row or not row[0]:
                return None
            total, ok = row[0], row[1] or 0
            return round(ok / total * 100, 4)
        except Exception:
            return None