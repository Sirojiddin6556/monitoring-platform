"""Maintenance Windows router — Sprint 3.

Suppresses alerts during planned maintenance for specific servers/websites.
"""
import logging
import datetime
from typing import Optional, List

from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from sqlalchemy import select

from .. import db
from ..models import MaintenanceWindow as MWModel
from ..security import get_current_user

logger = logging.getLogger("backend.maintenance")

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


class MaintenanceWindowCreate(BaseModel):
    name: str
    description: Optional[str] = None
    start_at: datetime.datetime
    end_at: datetime.datetime
    target_type: Optional[str] = None   # server, website, all
    target_ids: Optional[List[str]] = None
    org_id: Optional[int] = None
    suppress_alerts: bool = True


def _mw_to_dict(m: MWModel) -> dict:
    return {
        "id": m.id,
        "name": m.name,
        "description": m.description,
        "start_at": m.start_at.isoformat() if m.start_at else None,
        "end_at": m.end_at.isoformat() if m.end_at else None,
        "target_type": m.target_type,
        "target_ids": m.target_ids or [],
        "org_id": m.org_id,
        "suppress_alerts": m.suppress_alerts,
        "is_active": m.is_active,
        "created_by": m.created_by,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


@router.get("/active")
async def get_active_windows(current_user: dict = Depends(get_current_user)):
    """Return currently active maintenance windows (start_at <= now <= end_at)."""
    now = datetime.datetime.utcnow()
    async with db.get_session() as session:
        res = await session.execute(
            select(MWModel)
            .where(MWModel.is_active == True)
            .where(MWModel.start_at <= now)
            .where(MWModel.end_at >= now)
        )
        windows = res.scalars().all()
        return {"windows": [_mw_to_dict(w) for w in windows]}


@router.get("")
async def list_windows(
    include_past: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """List all maintenance windows, optionally filtering out past ones."""
    async with db.get_session() as session:
        q = select(MWModel).order_by(MWModel.start_at.desc())
        if not include_past:
            now = datetime.datetime.utcnow()
            q = q.where(MWModel.end_at >= now)
        res = await session.execute(q)
        windows = res.scalars().all()
        return {"windows": [_mw_to_dict(w) for w in windows]}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_window(data: MaintenanceWindowCreate, current_user: dict = Depends(get_current_user)):
    """Create a maintenance window."""
    if data.end_at <= data.start_at:
        raise HTTPException(status_code=400, detail="end_at must be after start_at")

    async with db.get_session() as session:
        window = MWModel(
            name=data.name,
            description=data.description,
            start_at=data.start_at,
            end_at=data.end_at,
            target_type=data.target_type,
            target_ids=data.target_ids or [],
            org_id=data.org_id,
            suppress_alerts=data.suppress_alerts,
            is_active=True,
            created_by=int(current_user["user_id"]),
            created_at=datetime.datetime.utcnow(),
        )
        session.add(window)
        await session.commit()
        await session.refresh(window)
        return _mw_to_dict(window)


@router.get("/{window_id}")
async def get_window(window_id: int, current_user: dict = Depends(get_current_user)):
    async with db.get_session() as session:
        window = await session.get(MWModel, window_id)
        if not window:
            raise HTTPException(status_code=404, detail="Maintenance window not found")
        return _mw_to_dict(window)


@router.put("/{window_id}")
async def update_window(window_id: int, data: MaintenanceWindowCreate, current_user: dict = Depends(get_current_user)):
    if data.end_at <= data.start_at:
        raise HTTPException(status_code=400, detail="end_at must be after start_at")
    async with db.get_session() as session:
        window = await session.get(MWModel, window_id)
        if not window:
            raise HTTPException(status_code=404, detail="Maintenance window not found")
        window.name = data.name
        window.description = data.description
        window.start_at = data.start_at
        window.end_at = data.end_at
        window.target_type = data.target_type
        window.target_ids = data.target_ids or []
        window.org_id = data.org_id
        window.suppress_alerts = data.suppress_alerts
        await session.commit()
        await session.refresh(window)
        return _mw_to_dict(window)


@router.delete("/{window_id}")
async def delete_window(window_id: int, current_user: dict = Depends(get_current_user)):
    async with db.get_session() as session:
        window = await session.get(MWModel, window_id)
        if not window:
            raise HTTPException(status_code=404, detail="Maintenance window not found")
        window.is_active = False
        await session.commit()
        return {"message": "Maintenance window cancelled"}


async def is_in_maintenance(target_type: str, target_id: str) -> bool:
    """Check if a given target is currently under maintenance (used by alert engine)."""
    now = datetime.datetime.utcnow()
    try:
        async with db.get_session() as session:
            res = await session.execute(
                select(MWModel)
                .where(MWModel.is_active == True)
                .where(MWModel.suppress_alerts == True)
                .where(MWModel.start_at <= now)
                .where(MWModel.end_at >= now)
            )
            windows = res.scalars().all()
            for w in windows:
                if w.target_type is None or w.target_type == "all":
                    return True
                if w.target_type == target_type:
                    ids = w.target_ids or []
                    if not ids or target_id in ids:
                        return True
    except Exception as e:
        logger.debug("is_in_maintenance check error: %s", e)
    return False
