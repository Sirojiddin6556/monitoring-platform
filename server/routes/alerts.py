"""Alert endpoints"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Alert
from ..schemas import AlertOut
from ..security import get_current_user

router = APIRouter(prefix='/alerts', tags=['alerts'])


@router.get('/', response_model=List[AlertOut])
async def list_alerts(
    tenant_id: int = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """List alerts"""
    query = db.query(Alert).order_by(Alert.created_at.desc())
    
    alerts = query.offset(offset).limit(limit).all()
    return alerts


@router.get('/{agent_id}', response_model=List[AlertOut])
async def get_agent_alerts(
    agent_id: int,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get alerts for specific agent"""
    alerts = db.query(Alert).filter(
        Alert.agent_id == agent_id
    ).order_by(Alert.created_at.desc()).offset(offset).limit(limit).all()
    
    return alerts
