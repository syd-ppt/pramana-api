"""Smoke tests for Pramana API endpoints."""

import pytest
import httpx

from api.main import app

pytestmark = pytest.mark.anyio


@pytest.fixture
def client():
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.anyio
async def test_root_returns_ok(client):
    response = await client.get("/api")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "pramana-api"


@pytest.mark.anyio
async def test_health_returns_healthy(client):
    response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "b2_configured" in data


@pytest.mark.anyio
async def test_submit_rejects_empty_body(client):
    response = await client.post("/api/submit", json={})
    assert response.status_code == 422


@pytest.mark.anyio
async def test_submit_validates_schema(client):
    response = await client.post("/api/submit", json={
        "model_id": "test-model",
        "prompt_id": "test-prompt",
        # missing required "output" field
    })
    assert response.status_code == 422


@pytest.mark.anyio
async def test_submit_rejects_invalid_auth_header(client):
    response = await client.post(
        "/api/submit",
        json={"model_id": "m", "prompt_id": "p", "output": "o"},
        headers={"Authorization": "NotBearer xyz"},
    )
    assert response.status_code == 401
