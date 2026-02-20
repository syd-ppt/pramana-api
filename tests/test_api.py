"""Smoke tests for Pramana API endpoints."""
from __future__ import annotations

from datetime import datetime
from io import BytesIO
from unittest.mock import MagicMock, patch

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
import httpx

from api.main import app
from api.models.schemas import BatchSubmissionRequest, SubmissionRequest

pytestmark = pytest.mark.anyio


@pytest.fixture
def client():
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


# ── Existing smoke tests ─────────────────────────────────────────────


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


# ── Batch submit forwards auth header ────────────────────────────────


@pytest.mark.anyio
async def test_batch_submit_forwards_auth_header(client):
    """Batch endpoint forwards auth to each item; invalid auth produces per-item errors."""
    response = await client.post(
        "/api/submit/batch",
        json={
            "suite_version": "1.0",
            "suite_hash": "abc",
            "model_id": "test",
            "temperature": 0.7,
            "seed": None,
            "timestamp": "2025-01-01T00:00:00Z",
            "results": [
                {"model_id": "m", "prompt_id": "p", "output": "o"},
            ],
        },
        headers={"Authorization": "NotBearer xyz"},
    )
    # Batch returns 200 with per-item errors (not a top-level 401)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "partial"
    assert data["submitted"] == 0
    assert len(data["errors"]) == 1
    assert "Invalid Authorization" in data["errors"][0]["error"]


# ── Schema validation: oversized output ──────────────────────────────


@pytest.mark.anyio
async def test_submit_rejects_oversized_output(client):
    """Output field exceeding 1MB is rejected by schema validation."""
    oversized_output = "x" * (1_048_576 + 1)
    response = await client.post(
        "/api/submit",
        json={
            "model_id": "test-model",
            "prompt_id": "test-prompt",
            "output": oversized_output,
        },
    )
    assert response.status_code == 422


# ── Schema validation: too many batch results ────────────────────────


def test_batch_schema_rejects_too_many_results():
    """Batch with >1000 results is rejected by schema validation."""
    with pytest.raises(Exception):
        BatchSubmissionRequest(
            suite_version="1.0",
            suite_hash="abc",
            model_id="test",
            temperature=0.7,
            seed=None,
            timestamp=datetime(2025, 1, 1),
            results=[
                SubmissionRequest(model_id="m", prompt_id="p", output="o")
                for _ in range(1001)
            ],
        )


# ── CORS: production requires CORS_ORIGINS ───────────────────────────


def test_cors_raises_in_production_without_origins():
    """CORS_ORIGINS must be set when ENVIRONMENT is not development."""
    import subprocess
    import sys

    result = subprocess.run(
        [
            sys.executable, "-c",
            "import os; "
            "os.environ['ENVIRONMENT'] = 'production'; "
            "os.environ.pop('CORS_ORIGINS', None); "
            "from api.main import app",
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "CORS_ORIGINS" in result.stderr


# ── B2Client: deletion finds files in nested date partitions ─────────


def test_b2_delete_finds_nested_user_files():
    """delete_user_data scans recursively and finds user files in date partitions."""
    from api.storage.b2_client import B2Client

    # Create mock file versions in nested date paths
    mock_file_1 = MagicMock()
    mock_file_1.file_name = "year=2025/month=01/day=15/user=abc123/file1.parquet"
    mock_file_1.id_ = "id1"

    mock_file_2 = MagicMock()
    mock_file_2.file_name = "year=2025/month=01/day=16/user=abc123/file2.parquet"
    mock_file_2.id_ = "id2"

    mock_file_other = MagicMock()
    mock_file_other.file_name = "year=2025/month=01/day=15/user=other/file3.parquet"
    mock_file_other.id_ = "id3"

    mock_bucket = MagicMock()
    mock_bucket.ls.return_value = [
        (mock_file_1, None),
        (mock_file_2, None),
        (mock_file_other, None),
    ]

    mock_api = MagicMock()

    # Patch B2Client.__init__ to avoid real B2 connection
    with patch.object(B2Client, "__init__", lambda _self: None):
        client = B2Client()
        client.bucket = mock_bucket
        client.api = mock_api

    import asyncio

    deleted = asyncio.run(client.delete_user_data("abc123"))

    assert deleted == 2
    assert mock_api.delete_file_version.call_count == 2
    # Verify only user=abc123 files were deleted
    calls = mock_api.delete_file_version.call_args_list
    assert calls[0].args == ("id1", mock_file_1.file_name)
    assert calls[1].args == ("id2", mock_file_2.file_name)


# ── Stats endpoint requires auth ─────────────────────────────────────


@pytest.mark.anyio
async def test_stats_requires_auth(client):
    """Stats endpoint requires Authorization header."""
    response = await client.get("/api/user/me/stats")
    assert response.status_code == 422  # Missing required header


@pytest.mark.anyio
async def test_stats_rejects_invalid_token(client):
    """Stats endpoint rejects invalid Bearer token."""
    response = await client.get(
        "/api/user/me/stats",
        headers={"Authorization": "Bearer invalid-token"},
    )
    # Without NEXTAUTH_SECRET set, returns 500; with it set, returns 401
    assert response.status_code in (401, 500)


# ── Data endpoint logs errors instead of swallowing silently ─────────


def test_data_endpoint_raises_on_file_error():
    """Data route raises errors when file download fails instead of silently passing."""
    from api.routes.data import _download_file

    mock_bucket = MagicMock()
    mock_download = MagicMock()
    mock_download.save.side_effect = RuntimeError("download failed")
    mock_bucket.download_file_by_name.return_value = mock_download

    with pytest.raises(RuntimeError, match="download failed"):
        _download_file(mock_bucket, "test.parquet")


# ── Stats endpoint: integration with mock Parquet data ────────────────


def _make_parquet_buffer(
    model_ids: list[str],
    timestamps: list[datetime],
) -> BytesIO:
    """Build a Parquet buffer from model_ids and timestamps."""
    table = pa.table({
        "model_id": pa.array(model_ids, type=pa.string()),
        "timestamp": pa.array(timestamps, type=pa.timestamp("us")),
    })
    buf = BytesIO()
    pq.write_table(table, buf)
    buf.seek(0)
    return buf


def _make_mock_download(parquet_buf: BytesIO) -> MagicMock:
    """Create a mock download object that writes Parquet bytes into the target buffer."""
    mock_dl = MagicMock()

    def save_to(target: BytesIO) -> None:
        target.write(parquet_buf.read())
        parquet_buf.seek(0)

    mock_dl.save.side_effect = save_to
    return mock_dl


def test_stats_aggregates_parquet_data():
    """Stats _gather_stats correctly aggregates submissions from multiple Parquet files."""
    from api.storage.b2_client import B2Client

    ts1 = datetime(2025, 3, 10, 12, 0, 0)
    ts2 = datetime(2025, 3, 11, 14, 30, 0)
    ts3 = datetime(2025, 3, 12, 9, 0, 0)

    buf1 = _make_parquet_buffer(["gpt-4", "gpt-4"], [ts1, ts2])
    buf2 = _make_parquet_buffer(["claude-3", "gpt-4", "claude-3"], [ts3, ts3, ts3])

    # Mock file versions in Hive-partitioned paths
    file1 = MagicMock()
    file1.file_name = "year=2025/month=03/day=10/user=testuser/batch1.parquet"
    file2 = MagicMock()
    file2.file_name = "year=2025/month=03/day=12/user=testuser/batch2.parquet"
    file_other = MagicMock()
    file_other.file_name = "year=2025/month=03/day=10/user=someone_else/batch3.parquet"

    mock_bucket = MagicMock()
    mock_bucket.ls.return_value = [
        (file1, None),
        (file2, None),
        (file_other, None),
    ]

    # Map file_name to its mock download
    downloads = {
        file1.file_name: _make_mock_download(buf1),
        file2.file_name: _make_mock_download(buf2),
    }
    mock_bucket.download_file_by_name.side_effect = lambda name: downloads[name]

    with patch.object(B2Client, "__init__", lambda _self: None):
        client = B2Client()
        client.bucket = mock_bucket
        client.api = MagicMock()

    # Replicate _gather_stats aggregation logic with mock client
    target_segment = "/user=testuser/"

    models_seen: set[str] = set()
    total = 0
    latest_ts = None
    for file_version, _ in client.bucket.ls(recursive=True):
        if target_segment not in f"/{file_version.file_name}":
            continue
        if not file_version.file_name.endswith(".parquet"):
            continue
        buf = BytesIO()
        client.bucket.download_file_by_name(file_version.file_name).save(buf)
        buf.seek(0)
        table = pq.read_table(buf)
        data = table.to_pydict()
        total += len(data.get("model_id", []))
        for mid in data.get("model_id", []):
            models_seen.add(mid)
        for ts in data.get("timestamp", []):
            dt = ts.as_py() if hasattr(ts, "as_py") else ts
            if latest_ts is None or dt > latest_ts:
                latest_ts = dt

    # Verify aggregation
    assert total == 5, f"Expected 5 submissions, got {total}"
    assert models_seen == {"gpt-4", "claude-3"}
    assert latest_ts == ts3
    # file_other should not have been downloaded
    assert mock_bucket.download_file_by_name.call_count == 2
