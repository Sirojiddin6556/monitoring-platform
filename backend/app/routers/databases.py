"""Database Telemetry & Management Router."""
import logging
from fastapi import APIRouter, Depends
from ..services.database_service import DatabaseService
from ..security import get_current_user

logger = logging.getLogger("backend.routers.databases")

router = APIRouter(tags=["databases"])

@router.get('/api/databases')
async def get_databases(current_user: dict = Depends(get_current_user)):
    """Returns deep PostgreSQL and Redis telemetry, automated backup status, and discovered databases."""
    try:
        return await DatabaseService.get_telemetry()
    except Exception as e:
        logger.error("Error fetching databases telemetry: %s", e)
        return {
            'postgres_summary': {'status': 'error', 'error': str(e)},
            'redis_summary': {'status': 'error', 'error': str(e)},
            'backup_summary': None,
            'databases': []
        }
