"""Metrics collection and retrieval endpoints"""

from datetime import datetime, timezone, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session

from ..config import API_KEY
from ..database import get_db
from ..models import Agent, Metric, Tenant
from ..schemas import MetricIn, MetricOut

router = APIRouter(prefix='/metrics', tags=['metrics'])


@router.post('/push', status_code=status.HTTP_201_CREATED)
async def push_metrics(
    metric: MetricIn,
    api_key: str = Header(None),
    db: Session = Depends(get_db)
):
    """Push metrics from agent"""
    # Verify API key
    if api_key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid API key'
        )
    
    # Get or create agent
    agent = db.query(Agent).filter(Agent.agent_id == metric.agent_id).first()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Agent not found'
        )
    
    # Update agent last_seen
    agent.last_seen = datetime.now(timezone.utc)
    
    # Create metric record
    db_metric = Metric(
        agent_id=agent.id,
        cpu_percent=metric.cpu_percent,
        memory_percent=metric.memory_percent,
        disk_percent=metric.disk_percent,
        network_sent=metric.network_sent,
        network_recv=metric.network_recv,
        load_average_1=metric.load_average_1,
        load_average_5=metric.load_average_5,
        load_average_15=metric.load_average_15,
        timestamp=datetime.now(timezone.utc)
    )
    
    db.add(db_metric)
    db.commit()
    db.refresh(db_metric)
    
    return {'status': 'ok', 'metric_id': db_metric.id}


@router.get('/{agent_id}', response_model=List[MetricOut])
async def get_agent_metrics(
    agent_id: int,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """Get metrics for specific agent"""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Agent not found'
        )
    
    metrics = db.query(Metric).filter(
        Metric.agent_id == agent_id
    ).order_by(Metric.timestamp.desc()).offset(offset).limit(limit).all()
    
    return metrics


@router.get('/range/{agent_id}')
async def get_metrics_range(
    agent_id: int,
    hours: int = 24,
    db: Session = Depends(get_db)
):
    """Get metrics for specific time range"""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Agent not found'
        )
    
    cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours)
    
    metrics = db.query(Metric).filter(
        Metric.agent_id == agent_id,
        Metric.timestamp >= cutoff_time
    ).order_by(Metric.timestamp.asc()).all()
    
    return metrics
