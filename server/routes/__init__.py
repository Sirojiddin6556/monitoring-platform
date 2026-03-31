"""Routes package initialization"""

from .health import router as health_router
from .metrics import router as metrics_router
from .agents import router as agents_router
from .alerts import router as alerts_router
from .dashboard import router as dashboard_router

__all__ = [
    'health_router',
    'metrics_router', 
    'agents_router',
    'alerts_router',
    'dashboard_router'
]
