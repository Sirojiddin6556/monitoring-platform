"""Health check endpoint"""

from datetime import datetime, timezone
from fastapi import APIRouter
from ..schemas import HealthResponse

router = APIRouter(tags=['health'])


@router.get('/health', response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status='ok',
        timestamp=datetime.now(timezone.utc)
    )
