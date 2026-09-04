"""Test configuration and fixtures."""
import os
import asyncio
import pytest
import pytest_asyncio

# Set test env vars before importing app
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./data/test_monitoring.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-ci-only-minimum-32-chars!")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "nZdpuD51A1imuEBxtKT9tFm5pL5loC8QtHNlKwiw3vM=")
os.environ.setdefault("INGEST_API_KEY", "test-ingest-key-ci")
os.environ.setdefault("DEV_ALLOW_INSECURE_SECRET", "1")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("INITIAL_ADMIN_EMAIL", "admin@test.com")
os.environ.setdefault("INITIAL_ADMIN_PASSWORD", "Test1234!")

from httpx import AsyncClient, ASGITransport  # noqa: E402
from app.main import app  # noqa: E402
from app import db as app_db  # noqa: E402


@pytest.fixture(scope="session")
def event_loop():
    policy = asyncio.get_event_loop_policy()
    loop = policy.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def setup_db():
    """Initialize DB schema once per test session."""
    await app_db.init_db()
    yield


@pytest_asyncio.fixture(scope="session")
async def client(setup_db):
    """Async HTTP test client."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture(scope="session")
async def admin_token(client: AsyncClient):
    """Get an admin JWT token."""
    resp = await client.post("/api/auth/login", json={
        "email": "admin@test.com",
        "password": "Test1234!"
    })
    if resp.status_code == 200:
        return resp.json()["access_token"]
    return None


@pytest_asyncio.fixture(scope="session")
async def auth_headers(admin_token):
    """Authorization headers for admin requests."""
    if admin_token:
        return {"Authorization": f"Bearer {admin_token}"}
    return {}
