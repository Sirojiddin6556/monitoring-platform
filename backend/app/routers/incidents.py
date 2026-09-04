"""Incident Management router — Sprint 3."""
import logging
import datetime
from typing import Optional, List

from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from sqlalchemy import select

from .. import db
from ..models import Incident as IncidentModel, IncidentComment as CommentModel, User as UserModel
from ..security import get_current_user

logger = logging.getLogger("backend.incidents")

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


class IncidentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    severity: str = "warning"
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    alert_ids: Optional[List[int]] = None
    assignee_id: Optional[int] = None
    org_id: Optional[int] = None


class IncidentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    assignee_id: Optional[int] = None
    resolution_note: Optional[str] = None


class CommentCreate(BaseModel):
    content: str


def _incident_to_dict(i: IncidentModel) -> dict:
    return {
        "id": i.id,
        "title": i.title,
        "description": i.description,
        "severity": i.severity,
        "status": i.status,
        "org_id": i.org_id,
        "target_type": i.target_type,
        "target_id": i.target_id,
        "alert_ids": i.alert_ids or [],
        "assignee_id": i.assignee_id,
        "created_by": i.created_by,
        "opened_at": i.opened_at.isoformat() if i.opened_at else None,
        "acknowledged_at": i.acknowledged_at.isoformat() if i.acknowledged_at else None,
        "resolved_at": i.resolved_at.isoformat() if i.resolved_at else None,
        "closed_at": i.closed_at.isoformat() if i.closed_at else None,
        "resolution_note": i.resolution_note,
        "created_at": i.created_at.isoformat() if i.created_at else None,
        "updated_at": i.updated_at.isoformat() if i.updated_at else None,
    }


@router.get("")
async def list_incidents(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    org_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    """List incidents with optional filters."""
    async with db.get_session() as session:
        q = select(IncidentModel).order_by(IncidentModel.created_at.desc())

        role = current_user.get("role")
        user_org_ids = current_user.get("org_ids", [])

        if role != "admin" and user_org_ids:
            q = q.where(IncidentModel.org_id.in_(user_org_ids))
        elif org_id is not None:
            q = q.where(IncidentModel.org_id == org_id)

        if status:
            q = q.where(IncidentModel.status == status)
        if severity:
            q = q.where(IncidentModel.severity == severity)

        q = q.offset(offset).limit(min(limit, 200))
        result = await session.execute(q)
        incidents = result.scalars().all()
        return {"incidents": [_incident_to_dict(i) for i in incidents]}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_incident(data: IncidentCreate, current_user: dict = Depends(get_current_user)):
    """Create a new incident manually."""
    async with db.get_session() as session:
        now = datetime.datetime.utcnow()
        incident = IncidentModel(
            title=data.title,
            description=data.description,
            severity=data.severity,
            status="open",
            org_id=data.org_id,
            target_type=data.target_type,
            target_id=data.target_id,
            alert_ids=data.alert_ids or [],
            assignee_id=data.assignee_id,
            created_by=int(current_user["user_id"]),
            opened_at=now,
            created_at=now,
            updated_at=now,
        )
        session.add(incident)
        await session.commit()
        await session.refresh(incident)
        return _incident_to_dict(incident)


@router.get("/{incident_id}")
async def get_incident(incident_id: int, current_user: dict = Depends(get_current_user)):
    async with db.get_session() as session:
        incident = await session.get(IncidentModel, incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        return _incident_to_dict(incident)


@router.patch("/{incident_id}")
async def update_incident(incident_id: int, data: IncidentUpdate, current_user: dict = Depends(get_current_user)):
    async with db.get_session() as session:
        incident = await session.get(IncidentModel, incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        if data.title is not None:
            incident.title = data.title
        if data.description is not None:
            incident.description = data.description
        if data.severity is not None:
            incident.severity = data.severity
        if data.assignee_id is not None:
            incident.assignee_id = data.assignee_id
        if data.resolution_note is not None:
            incident.resolution_note = data.resolution_note
        incident.updated_at = datetime.datetime.utcnow()
        await session.commit()
        await session.refresh(incident)
        return _incident_to_dict(incident)


@router.post("/{incident_id}/acknowledge")
async def acknowledge_incident(incident_id: int, current_user: dict = Depends(get_current_user)):
    """Move incident to 'acknowledged' status."""
    async with db.get_session() as session:
        incident = await session.get(IncidentModel, incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        if incident.status not in ("open",):
            raise HTTPException(status_code=400, detail=f"Cannot acknowledge incident in status '{incident.status}'")
        now = datetime.datetime.utcnow()
        incident.status = "acknowledged"
        incident.acknowledged_at = now
        incident.updated_at = now
        await session.commit()
        return {"message": "Incident acknowledged", "status": "acknowledged"}


@router.post("/{incident_id}/resolve")
async def resolve_incident(
    incident_id: int,
    note: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Resolve incident with optional resolution note."""
    async with db.get_session() as session:
        incident = await session.get(IncidentModel, incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        if incident.status == "closed":
            raise HTTPException(status_code=400, detail="Incident already closed")
        now = datetime.datetime.utcnow()
        incident.status = "resolved"
        incident.resolved_at = now
        incident.updated_at = now
        if note:
            incident.resolution_note = note
        await session.commit()
        return {"message": "Incident resolved", "status": "resolved"}


@router.post("/{incident_id}/close")
async def close_incident(incident_id: int, current_user: dict = Depends(get_current_user)):
    """Close a resolved incident."""
    async with db.get_session() as session:
        incident = await session.get(IncidentModel, incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        now = datetime.datetime.utcnow()
        incident.status = "closed"
        incident.closed_at = now
        incident.updated_at = now
        await session.commit()
        return {"message": "Incident closed", "status": "closed"}


@router.get("/{incident_id}/comments")
async def list_comments(incident_id: int, current_user: dict = Depends(get_current_user)):
    async with db.get_session() as session:
        res = await session.execute(
            select(CommentModel)
            .where(CommentModel.incident_id == incident_id)
            .order_by(CommentModel.created_at.asc())
        )
        comments = res.scalars().all()
        return {"comments": [
            {
                "id": c.id,
                "incident_id": c.incident_id,
                "user_id": c.user_id,
                "content": c.content,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in comments
        ]}


@router.post("/{incident_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_comment(incident_id: int, data: CommentCreate, current_user: dict = Depends(get_current_user)):
    async with db.get_session() as session:
        incident = await session.get(IncidentModel, incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        comment = CommentModel(
            incident_id=incident_id,
            user_id=int(current_user["user_id"]),
            content=data.content,
            created_at=datetime.datetime.utcnow(),
        )
        session.add(comment)
        await session.commit()
        await session.refresh(comment)
        return {
            "id": comment.id,
            "incident_id": comment.incident_id,
            "user_id": comment.user_id,
            "content": comment.content,
            "created_at": comment.created_at.isoformat() if comment.created_at else None,
        }
