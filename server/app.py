"""FastAPI application factory"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db
from .routes import (
    health_router,
    metrics_router,
    agents_router,
    alerts_router,
    dashboard_router
)


def create_app() -> FastAPI:
    """Create and configure FastAPI application"""
    app = FastAPI(
        title='System Monitoring API',
        description='API for system metrics collection and monitoring',
        version='1.0.0'
    )
    
    # Initialize database
    init_db()
    
    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=['*'],
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )
    
    # Include routers
    app.include_router(health_router)
    app.include_router(metrics_router)
    app.include_router(agents_router)
    app.include_router(alerts_router)
    app.include_router(dashboard_router)
    
    return app


# Create app instance
app = create_app()


@app.get('/')
async def root():
    """Root endpoint"""
    return {
        'message': 'System Monitoring API',
        'version': '1.0.0',
        'docs': '/docs',
        'health': '/health',
        'dashboard': '/dashboard'
    }
