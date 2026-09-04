"""Per-server alert threshold configuration — Sprint 3."""
import logging
import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import select

from .. import db
from ..models import ServerAlertConfig as ConfigModel, Server as ServerModel
from ..security import get_current_user, get_admin_user

logger = logging.getLogger("backend.server_configs")

router = APIRouter(prefix="/api/servers", tags=["servers"])


class ServerAlertConfigUpdate(BaseModel):
    cpu_threshold: Optional[int] = None
    ram_threshold: Optional[int] = None
    disk_threshold: Optional[int] = None
    swap_threshold: Optional[int] = None
    ping_threshold: Optional[int] = None
    alerts_enabled: Optional[bool] = None


def _config_to_dict(c: ConfigModel) -> dict:
    return {
        "id": c.id,
        "server_id": c.server_id,
        "cpu_threshold": c.cpu_threshold,
        "ram_threshold": c.ram_threshold,
        "disk_threshold": c.disk_threshold,
        "swap_threshold": c.swap_threshold,
        "ping_threshold": c.ping_threshold,
        "alerts_enabled": c.alerts_enabled,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


@router.get("/{server_id}/alert-config")
async def get_server_alert_config(server_id: str, current_user: dict = Depends(get_current_user)):
    """Get per-server alert thresholds. Returns None values when global settings are used."""
    async with db.get_session() as session:
        srv = await session.get(ServerModel, server_id)
        if not srv:
            raise HTTPException(status_code=404, detail="Server not found")
        res = await session.execute(
            select(ConfigModel).where(ConfigModel.server_id == server_id)
        )
        config = res.scalars().first()
        if not config:
            return {
                "server_id": server_id,
                "cpu_threshold": None,
                "ram_threshold": None,
                "disk_threshold": None,
                "swap_threshold": None,
                "ping_threshold": None,
                "alerts_enabled": True,
                "note": "Using global thresholds",
            }
        return _config_to_dict(config)


@router.put("/{server_id}/alert-config")
async def upsert_server_alert_config(
    server_id: str,
    data: ServerAlertConfigUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Create or update per-server alert thresholds."""
    async with db.get_session() as session:
        srv = await session.get(ServerModel, server_id)
        if not srv:
            raise HTTPException(status_code=404, detail="Server not found")

        res = await session.execute(
            select(ConfigModel).where(ConfigModel.server_id == server_id)
        )
        config = res.scalars().first()
        now = datetime.datetime.utcnow()

        if config is None:
            config = ConfigModel(
                server_id=server_id,
                cpu_threshold=data.cpu_threshold,
                ram_threshold=data.ram_threshold,
                disk_threshold=data.disk_threshold,
                swap_threshold=data.swap_threshold,
                ping_threshold=data.ping_threshold,
                alerts_enabled=data.alerts_enabled if data.alerts_enabled is not None else True,
                created_at=now,
                updated_at=now,
            )
            session.add(config)
        else:
            if data.cpu_threshold is not None:
                config.cpu_threshold = data.cpu_threshold
            if data.ram_threshold is not None:
                config.ram_threshold = data.ram_threshold
            if data.disk_threshold is not None:
                config.disk_threshold = data.disk_threshold
            if data.swap_threshold is not None:
                config.swap_threshold = data.swap_threshold
            if data.ping_threshold is not None:
                config.ping_threshold = data.ping_threshold
            if data.alerts_enabled is not None:
                config.alerts_enabled = data.alerts_enabled
            config.updated_at = now

        await session.commit()
        await session.refresh(config)
        return _config_to_dict(config)


@router.delete("/{server_id}/alert-config")
async def reset_server_alert_config(server_id: str, current_user: dict = Depends(get_admin_user)):
    """Reset server to use global alert thresholds."""
    async with db.get_session() as session:
        res = await session.execute(
            select(ConfigModel).where(ConfigModel.server_id == server_id)
        )
        config = res.scalars().first()
        if config:
            await session.delete(config)
            await session.commit()
    return {"message": "Server alert config reset to global defaults"}


async def get_effective_thresholds(server_id: str, global_settings: dict) -> dict:
    """
    Return effective thresholds for a server.
    Per-server config overrides global APP_SETTINGS when set.
    """
    try:
        async with db.get_session() as session:
            res = await session.execute(
                select(ConfigModel).where(ConfigModel.server_id == server_id)
            )
            config = res.scalars().first()
    except Exception:
        config = None

    def _threshold(per_server_val, global_key: str) -> int:
        if per_server_val is not None:
            return per_server_val
        return int(global_settings.get(global_key, 0))

    alerts_enabled = True
    if config is not None and not config.alerts_enabled:
        alerts_enabled = False

    return {
        "alerts_enabled": alerts_enabled,
        "cpu": _threshold(config.cpu_threshold if config else None, "alert_cpu_threshold"),
        "ram": _threshold(config.ram_threshold if config else None, "alert_ram_threshold"),
        "disk": _threshold(config.disk_threshold if config else None, "alert_disk_threshold"),
        "swap": _threshold(config.swap_threshold if config else None, "alert_swap_threshold"),
        "ping": _threshold(config.ping_threshold if config else None, "alert_ping_threshold"),
    }
