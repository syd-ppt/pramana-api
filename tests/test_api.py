"""Smoke tests for Pramana API endpoints."""
from __future__ import annotations

from datetime import datetime
from io import BytesIO
from unittest.mock import MagicMock, patch

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
import httpx

from fastapi import HTTPException

from backend.main import app
from backend.models.schemas import BatchSubmissionRequest, SubmissionRequest

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
    assert response.status_code == 422, (
        f"Empty body should return 422, got {response.status_code}. "
        "Check api/routes/submit.py SubmissionRequest schema validation."
    )
    detail = response.json().get("detail", [])
    missing_fields = {e.get("loc", [])[-1] for e in detail if isinstance(e, dict)}
    for required in ("model_id", "prompt_id", "output"):
        assert required in missing_fields, (
            f"422 response missing field '{required}' in validation errors. "
            f"Got fields: {missing_fields}. Check api/models/schemas.py SubmissionRequest."
        )


@pytest.mark.anyio
async def test_submit_validates_schema(client):
    response = await client.post("/api/submit", json={
        "model_id": "test-model",
        "prompt_id": "test-prompt",
        # missing required "output" field
    })
    assert response.status_code == 422, (
        f"Missing 'output' field should return 422, got {response.status_code}. "
        "Check api/models/schemas.py SubmissionRequest required fields."
    )


@pytest.mark.anyio
async def test_submit_rejects_invalid_auth_header(client):
    response = await client.post(
        "/api/submit",
        json={"model_id": "m", "prompt_id": "p", "output": "o"},
        headers={"Authorization": "NotBearer xyz"},
    )
    assert response.status_code == 401, (
        f"Invalid auth prefix should return 401, got {response.status_code}. "
        "Check api/routes/submit.py validate_token() Bearer prefix check."
    )
    detail = response.json().get("detail", "")
    assert "Invalid Authorization" in detail, (
        f"401 detail should mention 'Invalid Authorization', got: '{detail}'. "
        "Check api/routes/submit.py validate_token() error message."
    )


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
    assert response.status_code == 422, (
        f"Oversized output (>1MB) should return 422, got {response.status_code}. "
        "Check api/models/schemas.py SubmissionRequest output max_length validator."
    )


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


def test_cors_warns_in_production_without_origins():
    """CORS_ORIGINS warning is logged when ENVIRONMENT is production without CORS_ORIGINS."""
    import subprocess
    import sys

    result = subprocess.run(
        [
            sys.executable, "-c",
            "import os, logging; "
            "logging.basicConfig(level=logging.WARNING); "
            "os.environ['ENVIRONMENT'] = 'production'; "
            "os.environ.pop('CORS_ORIGINS', None); "
            "os.environ.pop('VERCEL_ENV', None); "
            "from backend.main import app",
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0
    assert "CORS_ORIGINS" in result.stderr


# ── B2Client: deletion finds files in nested date partitions ─────────


def test_b2_delete_finds_nested_user_files():
    """delete_user_data scans recursively and finds user files in date partitions."""
    from backend.storage.b2_client import B2Client

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
    assert response.status_code == 422, (
        f"Missing Authorization header should return 422, got {response.status_code}. "
        "Check api/routes/user.py stats endpoint header dependency."
    )


@pytest.mark.anyio
async def test_stats_rejects_invalid_token(client, monkeypatch):
    """Stats endpoint rejects invalid Bearer token."""
    monkeypatch.setenv("NEXTAUTH_SECRET", "test-secret-for-jwt-validation")
    response = await client.get(
        "/api/user/me/stats",
        headers={"Authorization": "Bearer invalid-token"},
    )
    assert response.status_code == 401, (
        f"Invalid Bearer token should return 401, got {response.status_code}. "
        "Check api/routes/submit.py validate_token() JWT decode error handling."
    )
    detail = response.json().get("detail", "")
    assert "token" in detail.lower() or "invalid" in detail.lower(), (
        f"401 detail should mention 'token' or 'invalid', got: '{detail}'. "
        "Check api/routes/submit.py validate_token() error messages."
    )


# ── Data endpoint logs errors instead of swallowing silently ─────────


def test_data_endpoint_raises_on_file_error():
    """Data route raises errors when file download fails instead of silently passing."""
    from backend.routes.data import _download_file

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
    """gather_user_stats correctly aggregates submissions from multiple Parquet files."""
    from backend.routes.user import gather_user_stats

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

    stats = gather_user_stats(mock_bucket, "testuser")

    assert stats["total_submissions"] == 5
    assert set(stats["models_tested"]) == {"gpt-4", "claude-3"}
    assert stats["last_submission"] is not None
    assert mock_bucket.download_file_by_name.call_count == 2


# ── validate_token unit tests ──────────────────────────────────────


class TestValidateToken:
    """Direct unit tests for api/routes/submit.py validate_token()."""

    def _get_validate_token(self):
        from backend.routes.submit import validate_token
        return validate_token

    def test_none_returns_none(self):
        """Anonymous submission (no auth header) should return None."""
        validate_token = self._get_validate_token()
        result = validate_token(None)
        assert result is None, (
            "validate_token(None) must return None for anonymous submissions. "
            "Check api/routes/submit.py validate_token() first guard."
        )

    def test_non_bearer_prefix_raises_401(self):
        """Non-Bearer prefix should raise 401."""
        validate_token = self._get_validate_token()
        with pytest.raises(HTTPException) as exc_info:
            validate_token("Basic abc123")
        assert exc_info.value.status_code == 401, (
            f"Expected 401 for 'Basic' prefix, got {exc_info.value.status_code}. "
            "Check api/routes/submit.py validate_token() Bearer prefix check."
        )
        assert "Invalid Authorization" in exc_info.value.detail

    def test_missing_jwt_secret_raises_500(self, monkeypatch):
        """Missing NEXTAUTH_SECRET should raise 500."""
        validate_token = self._get_validate_token()
        monkeypatch.delenv("NEXTAUTH_SECRET", raising=False)
        with pytest.raises(HTTPException) as exc_info:
            validate_token("Bearer some-token")
        assert exc_info.value.status_code == 500, (
            f"Expected 500 when NEXTAUTH_SECRET missing, got {exc_info.value.status_code}. "
            "Check api/routes/submit.py validate_token() jwt_secret check."
        )
        assert "JWT secret not configured" in exc_info.value.detail

    def test_expired_jwt_raises_401(self, monkeypatch):
        """Expired JWT should raise 401 with 'Token expired'."""
        import jwt as pyjwt
        from datetime import timezone

        secret = "test-secret"
        monkeypatch.setenv("NEXTAUTH_SECRET", secret)
        expired_token = pyjwt.encode(
            {"userId": "abc", "exp": datetime(2020, 1, 1, tzinfo=timezone.utc)},
            secret,
            algorithm="HS256",
        )
        validate_token = self._get_validate_token()
        with pytest.raises(HTTPException) as exc_info:
            validate_token(f"Bearer {expired_token}")
        assert exc_info.value.status_code == 401, (
            f"Expected 401 for expired JWT, got {exc_info.value.status_code}. "
            "Check api/routes/submit.py validate_token() ExpiredSignatureError handler."
        )
        assert "expired" in exc_info.value.detail.lower()

    def test_valid_jwt_returns_userid(self, monkeypatch):
        """Valid JWT with userId should return the userId string."""
        import jwt as pyjwt

        secret = "test-secret"
        monkeypatch.setenv("NEXTAUTH_SECRET", secret)
        token = pyjwt.encode({"userId": "user_abc123"}, secret, algorithm="HS256")
        validate_token = self._get_validate_token()
        result = validate_token(f"Bearer {token}")
        assert result == "user_abc123", (
            f"Expected userId 'user_abc123', got '{result}'. "
            "Check api/routes/submit.py validate_token() payload.get('userId')."
        )

    def test_jwt_without_userid_raises_401(self, monkeypatch):
        """JWT payload missing userId key should raise 401."""
        import jwt as pyjwt

        secret = "test-secret"
        monkeypatch.setenv("NEXTAUTH_SECRET", secret)
        token = pyjwt.encode({"sub": "1234"}, secret, algorithm="HS256")
        validate_token = self._get_validate_token()
        with pytest.raises(HTTPException) as exc_info:
            validate_token(f"Bearer {token}")
        assert exc_info.value.status_code == 401, (
            f"Expected 401 for JWT missing userId, got {exc_info.value.status_code}. "
            "Check api/routes/submit.py validate_token() userId presence check."
        )
        assert "userId" in exc_info.value.detail


# ── Health endpoint: storage_configured reflects env ───────────────


@pytest.mark.anyio
async def test_health_storage_not_configured_without_env(client, monkeypatch):
    """Health endpoint reports storage_configured=false when R2 env vars are missing."""
    monkeypatch.delenv("R2_ENDPOINT_URL", raising=False)
    monkeypatch.delenv("R2_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("R2_SECRET_ACCESS_KEY", raising=False)
    monkeypatch.delenv("R2_BUCKET_NAME", raising=False)
    response = await client.get("/api/health")
    data = response.json()
    assert data["storage_configured"] is False, (
        f"storage_configured should be false without R2 env vars, got {data['storage_configured']}. "
        "Check backend/main.py health() R2 env var check logic."
    )


# ── Rate limiter: 61st request returns 429 ─────────────────────────


@pytest.mark.anyio
async def test_rate_limiter_returns_429():
    """61st request within window should return 429 with Retry-After header."""
    from backend.main import app as rate_app

    transport = httpx.ASGITransport(app=rate_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as rate_client:
        # Exhaust rate limit (60 requests)
        for _ in range(60):
            await rate_client.get("/api")

        # 61st request should be rate limited
        response = await rate_client.get("/api")
        assert response.status_code == 429, (
            f"61st request should return 429, got {response.status_code}. "
            "Check api/middleware/rate_limit.py RateLimitMiddleware max_requests=60."
        )
        assert "Retry-After" in response.headers, (
            "429 response must include Retry-After header. "
            "Check api/middleware/rate_limit.py RateLimitMiddleware dispatch() 429 response headers."
        )
