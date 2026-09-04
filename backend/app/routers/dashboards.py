"""Custom Dashboards router — Sprint 4."""
import logging
import datetime
from typing import Optional, List, Any

from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from sqlalchemy import select

from .. import db
from ..models import Dashboard as DashboardModel, DashboardWidget as WidgetModel
from ..security import get_current_user

logger = logging.getLogger("backend.dashboards")

router = APIRouter(prefix="/api/dashboards", tags=["dashboards"])


class DashboardCreate(BaseModel):
    name: str
    description: Optional[str] = None
    layout: Optional[dict] = None
    is_public: bool = False


class DashboardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    layout: Optional[dict] = None
    is_public: Optional[bool] = None


class WidgetCreate(BaseModel):
    widget_type: str          # metric_chart, uptime_bar, alert_list, server_status, stats_card
    title: Optional[str] = None
    config: Optional[dict] = None
    position_x: int = 0
    position_y: int = 0
    width: int = 4
    height: int = 3


class WidgetUpdate(BaseModel):
    widget_type: Optional[str] = None
    title: Optional[str] = None
    config: Optional[dict] = None
    position_x: Optional[int] = None
    position_y: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None


def _dash_to_dict(d: DashboardModel, widgets: list = None) -> dict:
    result = {
        "id": d.id,
        "name": d.name,
        "description": d.description,
        "layout": d.layout or {},
        "is_public": d.is_public,
        "owner_id": d.owner_id,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        "widget_count": len(widgets) if widgets is not None else 0,
    }
    if widgets is not None:
        result["widgets"] = [_widget_to_dict(w) for w in widgets]
    return result


def _widget_to_dict(w: WidgetModel) -> dict:
    return {
        "id": w.id,
        "dashboard_id": w.dashboard_id,
        "widget_type": w.widget_type,
        "title": w.title,
        "config": w.config or {},
        "position_x": w.position_x,
        "position_y": w.position_y,
        "width": w.width,
        "height": w.height,
        "created_at": w.created_at.isoformat() if w.created_at else None,
    }


@router.get("")
async def list_dashboards(current_user: dict = Depends(get_current_user)):
    """List all dashboards visible to the current user."""
    async with db.get_session() as session:
        user_id = int(current_user["user_id"])
        role = current_user.get("role")

        if role == "admin":
            q = select(DashboardModel).order_by(DashboardModel.created_at.desc())
        else:
            from sqlalchemy import or_
            q = select(DashboardModel).where(
                or_(DashboardModel.owner_id == user_id, DashboardModel.is_public == True)
            ).order_by(DashboardModel.created_at.desc())

        dashboards = (await session.execute(q)).scalars().all()

        result = []
        for d in dashboards:
            widgets_res = await session.execute(
                select(WidgetModel).where(WidgetModel.dashboard_id == d.id)
            )
            widgets = widgets_res.scalars().all()
            result.append(_dash_to_dict(d, widgets))

        return {"dashboards": result}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_dashboard(data: DashboardCreate, current_user: dict = Depends(get_current_user)):
    """Create a new dashboard."""
    now = datetime.datetime.utcnow()
    async with db.get_session() as session:
        dash = DashboardModel(
            name=data.name,
            description=data.description,
            layout=data.layout or {},
            is_public=data.is_public,
            owner_id=int(current_user["user_id"]),
            created_at=now,
            updated_at=now,
        )
        session.add(dash)
        await session.commit()
        await session.refresh(dash)
        return _dash_to_dict(dash, [])


@router.get("/{dashboard_id}")
async def get_dashboard(dashboard_id: int, current_user: dict = Depends(get_current_user)):
    """Get a dashboard with all its widgets."""
    async with db.get_session() as session:
        dash = await session.get(DashboardModel, dashboard_id)
        if not dash:
            raise HTTPException(status_code=404, detail="Dashboard not found")

        user_id = int(current_user["user_id"])
        role = current_user.get("role")
        if role != "admin" and not dash.is_public and dash.owner_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        widgets_res = await session.execute(
            select(WidgetModel).where(WidgetModel.dashboard_id == dashboard_id)
            .order_by(WidgetModel.position_y, WidgetModel.position_x)
        )
        widgets = widgets_res.scalars().all()
        return _dash_to_dict(dash, widgets)


@router.put("/{dashboard_id}")
async def update_dashboard(
    dashboard_id: int, data: DashboardUpdate, current_user: dict = Depends(get_current_user)
):
    """Update dashboard metadata."""
    async with db.get_session() as session:
        dash = await session.get(DashboardModel, dashboard_id)
        if not dash:
            raise HTTPException(status_code=404, detail="Dashboard not found")

        user_id = int(current_user["user_id"])
        if current_user.get("role") != "admin" and dash.owner_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        if data.name is not None:
            dash.name = data.name
        if data.description is not None:
            dash.description = data.description
        if data.layout is not None:
            dash.layout = data.layout
        if data.is_public is not None:
            dash.is_public = data.is_public
        dash.updated_at = datetime.datetime.utcnow()

        await session.commit()
        await session.refresh(dash)
        return _dash_to_dict(dash)


@router.delete("/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dashboard(dashboard_id: int, current_user: dict = Depends(get_current_user)):
    """Delete a dashboard and all its widgets."""
    async with db.get_session() as session:
        dash = await session.get(DashboardModel, dashboard_id)
        if not dash:
            raise HTTPException(status_code=404, detail="Dashboard not found")

        user_id = int(current_user["user_id"])
        if current_user.get("role") != "admin" and dash.owner_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Delete widgets first
        widgets_res = await session.execute(
            select(WidgetModel).where(WidgetModel.dashboard_id == dashboard_id)
        )
        for w in widgets_res.scalars().all():
            await session.delete(w)

        await session.delete(dash)
        await session.commit()


@router.post("/{dashboard_id}/widgets", status_code=status.HTTP_201_CREATED)
async def add_widget(
    dashboard_id: int, data: WidgetCreate, current_user: dict = Depends(get_current_user)
):
    """Add a widget to a dashboard."""
    async with db.get_session() as session:
        dash = await session.get(DashboardModel, dashboard_id)
        if not dash:
            raise HTTPException(status_code=404, detail="Dashboard not found")

        user_id = int(current_user["user_id"])
        if current_user.get("role") != "admin" and dash.owner_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        now = datetime.datetime.utcnow()
        widget = WidgetModel(
            dashboard_id=dashboard_id,
            widget_type=data.widget_type,
            title=data.title,
            config=data.config or {},
            position_x=data.position_x,
            position_y=data.position_y,
            width=data.width,
            height=data.height,
            created_at=now,
        )
        session.add(widget)
        dash.updated_at = now
        await session.commit()
        await session.refresh(widget)
        return _widget_to_dict(widget)


@router.put("/{dashboard_id}/widgets/{widget_id}")
async def update_widget(
    dashboard_id: int, widget_id: int, data: WidgetUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a widget's config or position."""
    async with db.get_session() as session:
        dash = await session.get(DashboardModel, dashboard_id)
        if not dash:
            raise HTTPException(status_code=404, detail="Dashboard not found")

        user_id = int(current_user["user_id"])
        if current_user.get("role") != "admin" and dash.owner_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        widget = await session.get(WidgetModel, widget_id)
        if not widget or widget.dashboard_id != dashboard_id:
            raise HTTPException(status_code=404, detail="Widget not found")

        for field in ("widget_type", "title", "config", "position_x", "position_y", "width", "height"):
            val = getattr(data, field)
            if val is not None:
                setattr(widget, field, val)

        dash.updated_at = datetime.datetime.utcnow()
        await session.commit()
        await session.refresh(widget)
        return _widget_to_dict(widget)


@router.delete("/{dashboard_id}/widgets/{widget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_widget(
    dashboard_id: int, widget_id: int, current_user: dict = Depends(get_current_user)
):
    """Remove a widget from a dashboard."""
    async with db.get_session() as session:
        dash = await session.get(DashboardModel, dashboard_id)
        if not dash:
            raise HTTPException(status_code=404, detail="Dashboard not found")

        user_id = int(current_user["user_id"])
        if current_user.get("role") != "admin" and dash.owner_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        widget = await session.get(WidgetModel, widget_id)
        if not widget or widget.dashboard_id != dashboard_id:
            raise HTTPException(status_code=404, detail="Widget not found")

        await session.delete(widget)
        dash.updated_at = datetime.datetime.utcnow()
        await session.commit()
