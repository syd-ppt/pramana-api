"""Submission API routes - Serverless-optimized."""
from __future__ import annotations

import hashlib
import json
import os
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Header, HTTPException
import jwt

from backend.models.schemas import (
    BatchSubmissionRequest,
    SubmissionRequest,
    SubmissionResponse,
)
from backend.storage.b2_client import B2Client

router = APIRouter()


def validate_token(authorization: str | None) -> str | None:
    """Validate JWT token and extract user_id.

    Args:
        authorization: Authorization header value

    Returns:
        user_id if token is valid, None if no token provided

    Raises:
        HTTPException: If token is invalid
    """
    if not authorization:
        return None

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")

    token = authorization[7:]  # Remove "Bearer " prefix

    jwt_secret = os.getenv("NEXTAUTH_SECRET")
    if not jwt_secret:
        raise HTTPException(status_code=500, detail="JWT secret not configured")

    try:
        # Decode JWT token
        payload = jwt.decode(token, jwt_secret, algorithms=["HS256"])
        user_id = payload.get("userId")

        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing userId")

        return user_id

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


async def write_to_b2(record: dict) -> str:
    """Write a single record to B2 as Parquet file.

    Serverless-friendly: creates B2 client per request, writes immediately.
    Returns the B2 file key.
    """
    import pyarrow as pa
    import pyarrow.parquet as pq
    from io import BytesIO
    import traceback

    # Create B2 client (lightweight, no persistent connection)
    try:
        b2_client = B2Client()
    except Exception as e:
        print(f"B2Client initialization failed: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"B2 initialization failed: {str(e)}")

    # Generate unique filename
    record_id = str(uuid.uuid4())
    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    filename = f"pramana_{timestamp}_{record_id[:8]}.parquet"

    # Create date partition path with user partition
    year = record["year"]
    month = str(record["month"]).zfill(2)
    day = str(record["day"]).zfill(2)
    user_partition = f"user={record.get('user_id', 'anonymous')}"
    key = f"year={year}/month={month}/day={day}/{user_partition}/{filename}"

    # Convert to Parquet
    schema = pa.schema([
        ("id", pa.string()),
        ("timestamp", pa.timestamp("us")),
        ("user_id", pa.string()),
        ("model_id", pa.string()),
        ("prompt_id", pa.string()),
        ("output", pa.string()),
        ("output_hash", pa.string()),
        ("metadata_json", pa.string()),
        ("year", pa.int32()),
        ("month", pa.int32()),
        ("day", pa.int32()),
    ])

    # Add ID to record
    record["id"] = record_id

    # Create table with single row
    table = pa.Table.from_pylist([record], schema=schema)

    # Write to bytes buffer
    buffer = BytesIO()
    pq.write_table(
        table,
        buffer,
        compression="ZSTD",
        compression_level=9,
    )

    # Upload to B2
    buffer.seek(0)
    await b2_client.upload_file(key, buffer.read())

    return record_id


@router.post("/submit", response_model=SubmissionResponse)
async def submit_result(
    submission: SubmissionRequest,
    authorization: str | None = Header(None)
):
    """Submit a single test result.

    Serverless mode: writes immediately to B2, no batching.
    Supports optional authentication for personalized tracking.
    """
    # Validate token and extract user_id (None if anonymous)
    user_id = validate_token(authorization)

    # Compute hash
    hash_input = f"{submission.model_id}|{submission.prompt_id}|{submission.output}"
    output_hash = hashlib.sha256(hash_input.encode()).hexdigest()

    # Create record
    now = datetime.now(UTC)
    record = {
        "timestamp": now,
        "user_id": user_id or "anonymous",
        "model_id": submission.model_id,
        "prompt_id": submission.prompt_id,
        "output": submission.output,
        "output_hash": f"sha256:{output_hash}",
        "metadata_json": json.dumps(submission.metadata or {}),
        "year": now.year,
        "month": now.month,
        "day": now.day,
    }

    # Write directly to B2
    try:
        record_id = await write_to_b2(record)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to write to storage: {str(e)}"
        )

    return SubmissionResponse(
        status="accepted",
        id=record_id,
        hash=f"sha256:{output_hash}",
    )


@router.post("/submit/batch")
async def submit_batch(
    batch: BatchSubmissionRequest,
    authorization: str | None = Header(None)
):
    """Submit batch of results.

    Note: In serverless mode, each result creates a separate file.
    For large batches, consider using the CLI to batch locally first.
    """
    responses = []
    errors = []

    for idx, result in enumerate(batch.results):
        try:
            response = await submit_result(result, authorization=authorization)
            responses.append(response)
        except HTTPException as e:
            errors.append({"index": idx, "error": e.detail})
        except Exception as e:
            errors.append({"index": idx, "error": str(e)})

    return {
        "status": "completed" if not errors else "partial",
        "submitted": len(responses),
        "errors": errors,
    }
