"""Tests for metrics/probe/log ingest endpoints."""
import pytest
from httpx import AsyncClient

INGEST_HEADERS = {"X-Ingest-Key": "test-ingest-key-ci"}


@pytest.mark.asyncio
async def test_metrics_no_key(client: AsyncClient):
    resp = await client.post("/api/metrics", json={
        "server_id": "test-server-1",
        "metrics": {"cpu": {"value": 42, "unit": "%"}}
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_metrics_with_key(client: AsyncClient):
    resp = await client.post(
        "/api/metrics",
        json={
            "server_id": "test-server-1",
            "metric": "system",
            "status": "ok",
            "metrics": {
                "cpu": {"value": 42, "unit": "%"},
                "ram": {"value": 65, "unit": "%"},
                "disk": {"value": 30, "unit": "%"},
            }
        },
        headers=INGEST_HEADERS,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "received"


@pytest.mark.asyncio
async def test_metrics_missing_server_id(client: AsyncClient):
    resp = await client.post(
        "/api/metrics",
        json={"metrics": {"cpu": {"value": 10}}},
        headers=INGEST_HEADERS,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_probe_with_key(client: AsyncClient):
    resp = await client.post(
        "/api/probe",
        json={
            "target": "https://example.com",
            "status": "up",
            "status_code": 200,
            "response_time": 123.4,
        },
        headers=INGEST_HEADERS,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "received"


@pytest.mark.asyncio
async def test_probe_no_key(client: AsyncClient):
    resp = await client.post("/api/probe", json={"target": "https://example.com"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_logs_with_key(client: AsyncClient):
    resp = await client.post(
        "/api/logs",
        json={
            "server_id": "test-server-1",
            "level": "ERROR",
            "message": "disk write error",
        },
        headers=INGEST_HEADERS,
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_metrics_history_unauthorized(client: AsyncClient):
    resp = await client.get("/api/metrics/history")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_metrics_history_authorized(client: AsyncClient, auth_headers: dict):
    if not auth_headers:
        pytest.skip("No admin token")
    resp = await client.get("/api/metrics/history?limit=5", headers=auth_headers)
    assert resp.status_code == 200
    assert "metrics" in resp.json()


@pytest.mark.asyncio
async def test_ping_endpoint(client: AsyncClient):
    resp = await client.get("/api/ping")
    assert resp.status_code == 200
    assert resp.json()["ping"] == "pong"
