"""Server Management and Telemetry Router."""
from typing import List, Optional
from fastapi import APIRouter, Depends, Request, HTTPException
from ..security import get_current_user, get_admin_user
from ..schemas import ServerCreate, AgentTokenResponse
from ..services.server_service import ServerService

router = APIRouter(tags=["servers"])

@router.get('/api/servers')
async def list_servers(request: Request, current_user: dict = Depends(get_current_user)):
    """List monitored servers with live telemetry and organizational filtering."""
    role = current_user.get("role")
    user_org_ids = None if role == "admin" else current_user.get("org_ids", [])
    return await ServerService.list_servers(user_org_ids=user_org_ids)

@router.post('/api/servers')
async def create_server(data: ServerCreate, current_user: dict = Depends(get_current_user)):
    """Register and configure a new monitored server."""
    return await ServerService.create_server(data)

@router.get('/api/servers/{server_id}/detail')
async def server_detail(server_id: str, current_user: dict = Depends(get_current_user)):
    """Get rich deep telemetry (disks, hardware, network, processes, containers, logs)."""
    return ServerService.get_server_detail(server_id)

@router.delete('/api/servers/{server_id}')
async def delete_server(server_id: str, current_user: dict = Depends(get_current_user)):
    """Remove server from monitoring and database."""
    return await ServerService.delete_server(server_id)

@router.get('/api/servers/{server_id}/metrics')
async def server_metrics(server_id: str, limit: int = 500, from_ts: Optional[int] = None, to_ts: Optional[int] = None, current_user: dict = Depends(get_current_user)):
    """Get historical time-series metrics for server."""
    return ServerService.get_server_metrics(server_id, limit=limit, from_ts=from_ts, to_ts=to_ts)

@router.get('/api/servers/{server_id}/agent-keys', response_model=List[AgentTokenResponse])
async def list_server_agent_keys(server_id: str, current_user: dict = Depends(get_admin_user)):
    """List active agent authentication keys for a server (Admin only)."""
    return await ServerService.list_agent_keys(server_id)

@router.post('/api/servers/{server_id}/agent-key', response_model=AgentTokenResponse)
async def create_server_agent_key(server_id: str, current_user: dict = Depends(get_admin_user)):
    """Generate a new agent authentication key for a server (Admin only)."""
    return await ServerService.create_agent_key(server_id)

@router.delete('/api/servers/{server_id}/agent-keys/{key_id}')
async def revoke_server_agent_key(server_id: str, key_id: int, current_user: dict = Depends(get_admin_user)):
    """Revoke an agent key (Admin only)."""
    return await ServerService.revoke_agent_key(server_id, key_id)

@router.put('/api/servers/{server_id}/organization')
async def assign_server_to_org(server_id: str, request: Request, current_user: dict = Depends(get_admin_user)):
    """Assign or remove server from an organization (Admin only)."""
    body = await request.json()
    org_id = body.get('org_id')
    return await ServerService.assign_server_to_org(server_id, org_id)
