"""Agent management endpoints"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Agent, AgentSettings, Tenant
from ..schemas import AgentCreateIn, AgentOut, AgentSettingsIn, AgentSettingsOut
from ..security import get_current_user

router = APIRouter(prefix='/agents', tags=['agents'])


@router.post('/create', response_model=AgentOut, status_code=status.HTTP_201_CREATED)
async def create_agent(
    agent: AgentCreateIn,
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Create new monitoring agent"""
    # Check tenant exists
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Tenant not found'
        )
    
    # Check agent doesn't already exist
    existing = db.query(Agent).filter(Agent.agent_id == agent.agent_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Agent already exists'
        )
    
    # Create agent
    db_agent = Agent(
        tenant_id=tenant_id,
        agent_id=agent.agent_id,
        hostname=agent.hostname
    )
    
    db.add(db_agent)
    db.flush()
    
    # Create default settings
    settings = AgentSettings(agent_id=db_agent.id)
    db.add(settings)
    
    db.commit()
    db.refresh(db_agent)
    
    return db_agent


@router.get('/', response_model=List[AgentOut])
async def list_agents(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """List all agents for tenant"""
    agents = db.query(Agent).filter(Agent.tenant_id == tenant_id).all()
    return agents


@router.get('/{agent_id}/latest', response_model=AgentOut)
async def get_latest_agent(
    agent_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get agent details"""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Agent not found'
        )
    return agent


@router.get('/{agent_id}/settings', response_model=AgentSettingsOut)
async def get_agent_settings(
    agent_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get agent settings/thresholds"""
    settings = db.query(AgentSettings).filter(AgentSettings.agent_id == agent_id).first()
    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Agent settings not found'
        )
    return settings


@router.put('/{agent_id}/settings', response_model=AgentSettingsOut)
async def update_agent_settings(
    agent_id: int,
    settings_update: AgentSettingsIn,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Update agent thresholds"""
    settings = db.query(AgentSettings).filter(AgentSettings.agent_id == agent_id).first()
    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Agent settings not found'
        )
    
    settings.cpu_threshold = settings_update.cpu_threshold
    settings.memory_threshold = settings_update.memory_threshold
    settings.disk_threshold = settings_update.disk_threshold
    settings.network_threshold = settings_update.network_threshold
    
    db.commit()
    db.refresh(settings)
    
    return settings
