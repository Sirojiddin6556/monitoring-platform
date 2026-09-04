"""Tests for server management endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_servers_unauthorized(client: AsyncClient):
    resp = await client.get("/api/servers")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_servers_authorized(client: AsyncClient, auth_headers: dict):
    if not auth_headers:
        pytest.skip("No admin token")
    resp = await client.get("/api/servers", headers=auth_headers)
    assert resp.status_code == 200
    assert "servers" in resp.json()


@pytest.mark.asyncio
async def test_create_server(client: AsyncClient, auth_headers: dict):
    if not auth_headers:
        pytest.skip("No admin token")
    resp = await client.post(
        "/api/servers",
        json={
            "id": "test-srv-create",
            "name": "Test Server",
            "host": "192.168.1.100",
            "monitor_type": "agent",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "test-srv-create"


@pytest.mark.asyncio
async def test_create_duplicate_server(client: AsyncClient, auth_headers: dict):
    if not auth_headers:
        pytest.skip("No admin token")
    payload = {"id": "test-srv-dup", "name": "Dup Server", "host": "10.0.0.1"}
    await client.post("/api/servers", json=payload, headers=auth_headers)
    resp = await client.post("/api/servers", json=payload, headers=auth_headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_delete_server(client: AsyncClient, auth_headers: dict):
    if not auth_headers:
        pytest.skip("No admin token")
    await client.post(
        "/api/servers",
        json={"id": "test-srv-del", "name": "Del Server", "host": "10.0.0.99"},
        headers=auth_headers,
    )
    resp = await client.delete("/api/servers/test-srv-del", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_delete_nonexistent_server(client: AsyncClient, auth_headers: dict):
    if not auth_headers:
        pytest.skip("No admin token")
    resp = await client.delete("/api/servers/nonexistent-xyz", headers=auth_headers)
    assert resp.status_code == 404
