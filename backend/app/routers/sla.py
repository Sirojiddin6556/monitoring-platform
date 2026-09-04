"""SLA / Uptime tracker router — Sprint 3.

SLA records are computed hourly by Celery. This router provides query endpoints.
"""
import logging
import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select, func

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
async def sla_summary(org_id: Optional[int] = None, current_user: dict = Depends(get_current_user)):
    """Aggregated uptime% for all servers and websites over last 30 days."""
    now = datetime.datetime.utcnow()
    since = now - datetime.timedelta(days=30)

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
            uptime_30d = await _compute_uptime(session, "server", srv.id, since, now)
            uptime_7d = await _compute_uptime(
                session, "server", srv.id, now - datetime.timedelta(days=7), now
            )
            uptime_24h = await _compute_uptime(
                session, "server", srv.id, now - datetime.timedelta(hours=24), now
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
            uptime_30d = await _compute_website_uptime(session, ws.id, since, now)
            uptime_7d = await _compute_website_uptime(
                session, ws.id, now - datetime.timedelta(days=7), now
            )
            uptime_24h = await _compute_website_uptime(
                session, ws.id, now - datetime.timedelta(hours=24), now
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

        return {"summary": result, "generated_at": now.isoformat()}


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


async def _compute_uptime(session, target_type: str, target_id: str, since, until) -> Optional[float]:
    """Compute uptime% from metrics table for a server."""
    try:
        res = await session.execute(
            select(MetricModel)
            .where(MetricModel.server_id == target_id)
            .where(MetricModel.received_at >= since)
            .where(MetricModel.received_at <= until)
        )
        metrics = res.scalars().all()
        if not metrics:
            return None
        total = len(metrics)
        ok = sum(1 for m in metrics if (m.payload or {}).get("status") in ("ok", "up"))
        return round(ok / total * 100, 4)
    except Exception:
        return None


async def _compute_website_uptime(session, website_id: str, since, until) -> Optional[float]:
    """Compute uptime% from probes table for a website."""
    try:
        res = await session.execute(
            select(ProbeModel)
            .where(ProbeModel.website_id == website_id)
            .where(ProbeModel.received_at >= since)
            .where(ProbeModel.received_at <= until)
        )
        probes = res.scalars().all()
        if not probes:
            return None
        total = len(probes)
        ok = sum(1 for p in probes if (p.payload or {}).get("status") in ("up", "ok"))
        return round(ok / total * 100, 4)
    except Exception:
        return None
