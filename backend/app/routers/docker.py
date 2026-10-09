"""Docker Router: Endpoints for cluster-wide container telemetry and statistics."""
from fastapi import APIRouter, Depends
from ..security import get_admin_user, get_current_user
from ..services.docker_service import DockerService

router = APIRouter(tags=["docker"])

@router.get('/api/docker/containers')
async def docker_all_containers(current_user: dict = Depends(get_current_user)):
    """Aggregated list of Docker containers across all monitored nodes."""
    return DockerService.get_all_containers()

@router.get('/api/docker/stats')
async def docker_stats(current_user: dict = Depends(get_current_user)):
    """Docker stats (running, stopped, servers with docker) across all monitored nodes."""
    return DockerService.get_stats()
