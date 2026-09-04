"""Tests for authentication endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    resp = await client.post("/api/auth/login", json={
        "email": "admin@test.com",
        "password": "Test1234!"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "user" in data
    assert data["user"]["role"] == "admin"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    resp = await client.post("/api/auth/login", json={
        "email": "admin@test.com",
        "password": "wrong-password"
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_user(client: AsyncClient):
    resp = await client.post("/api/auth/login", json={
        "email": "nobody@test.com",
        "password": "password"
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_rate_limit(client: AsyncClient):
    """After 10 failed attempts, return 429."""
    for _ in range(10):
        await client.post("/api/auth/login", json={
            "email": "ratelimit@test.com",
            "password": "wrong"
        })
    resp = await client.post("/api/auth/login", json={
        "email": "ratelimit@test.com",
        "password": "wrong"
    })
    assert resp.status_code == 429
    assert "Retry-After" in resp.headers

    # ASGITransport requests have no real client IP, so the rate limiter's
    # per-IP bucket collapses to a single "unknown" key shared by every test.
    # Reset it so this test doesn't lock out logins for the rest of the session.
    from app.main import _login_attempts
    _login_attempts.clear()


@pytest.mark.asyncio
async def test_me_unauthorized(client: AsyncClient):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_authorized(client: AsyncClient, auth_headers: dict):
    if not auth_headers:
        pytest.skip("No admin token available")
    resp = await client.get("/api/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "admin@test.com"
    assert data["role"] == "admin"


@pytest.mark.asyncio
async def test_invalid_token(client: AsyncClient):
    resp = await client.get("/api/auth/me", headers={"Authorization": "Bearer invalid-token"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_missing_bearer_prefix(client: AsyncClient, admin_token: str):
    if not admin_token:
        pytest.skip("No admin token available")
    resp = await client.get("/api/auth/me", headers={"Authorization": admin_token})
    assert resp.status_code == 401
