"""Submission API routes - Serverless-optimized."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Header, HTTPException

from backend.models.schemas import (
    BatchSubmissionRequest,
    SubmissionRequest,
    SubmissionResponse,
)
from backend.storage.client import StorageClient

router = APIRouter()


def _derive_nextauth_key(secret: str) -> bytes:
    """Derive the AES-256-GCM encryption key from NEXTAUTH_SECRET.

    NextAuth v4 uses HKDF(SHA-256) with:
      ikm=secret, salt="", info="NextAuth.js Generated Encryption Key", length=32
    """
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives import hashes

    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"",
        info=b"NextAuth.js Generated Encryption Key",
    ).derive(secret.encode())


def _decrypt_nextauth_jwe(token: str, secret: str) -> dict:
    """Decrypt a NextAuth v4 JWE token (alg=dir, enc=A256GCM).

    Token format (compact JWE): header.encryptedKey.iv.ciphertext.tag
    With alg=dir, encryptedKey is empty.
    """
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    parts = token.split(".")
    if len(parts) != 5:
        raise ValueError(f"JWE must have 5 parts, got {len(parts)}")

    _header_b64, _enc_key_b64, iv_b64, ciphertext_b64, tag_b64 = parts

    # base64url decode (add padding)
    def b64url_decode(s: str) -> bytes:
        return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))

    iv = b64url_decode(iv_b64)
    ciphertext = b64url_decode(ciphertext_b64)
    tag = b64url_decode(tag_b64)

    # AAD is the ASCII bytes of the protected header
    aad = _header_b64.encode("ascii")

    key = _derive_nextauth_key(secret)
    aesgcm = AESGCM(key)

    # AES-GCM expects ciphertext || tag
    plaintext = aesgcm.decrypt(iv, ciphertext + tag, aad)
    return json.loads(plaintext)


def validate_token(authorization: str | None) -> str | None:
    """Validate NextAuth JWE token and extract user_id.

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
        payload = _decrypt_nextauth_jwe(token, jwt_secret)
        user_id = payload.get("userId")

        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing userId")

        return user_id

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


_PARQUET_SCHEMA = None


def _get_schema():
    global _PARQUET_SCHEMA
    if _PARQUET_SCHEMA is None:
        import pyarrow as pa
        _PARQUET_SCHEMA = pa.schema([
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
    return _PARQUET_SCHEMA


async def write_records(records: list[dict]) -> list[str]:
    """Write records as a single Parquet file to object storage.

    Batches all rows into one file to minimize storage transactions.
    Returns list of record IDs.
    """
    import pyarrow as pa
    import pyarrow.parquet as pq
    from io import BytesIO

    if not records:
        return []

    client = StorageClient()

    # Assign IDs
    record_ids = []
    for record in records:
        record_id = str(uuid.uuid4())
        record["id"] = record_id
        record_ids.append(record_id)

    # Partition key from first record (all records in a batch share user+date)
    r0 = records[0]
    year = r0["year"]
    month = str(r0["month"]).zfill(2)
    day = str(r0["day"]).zfill(2)
    user_partition = f"user={r0.get('user_id', 'anonymous')}"
    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    batch_id = record_ids[0][:8]
    filename = f"pramana_{timestamp}_{batch_id}.parquet"
    key = f"year={year}/month={month}/day={day}/{user_partition}/{filename}"

    table = pa.Table.from_pylist(records, schema=_get_schema())

    buffer = BytesIO()
    pq.write_table(table, buffer, compression="ZSTD", compression_level=9)

    buffer.seek(0)
    await client.upload_file(key, buffer.read())

    return record_ids


def _build_record(submission: SubmissionRequest, user_id: str | None, now: datetime) -> tuple[dict, str]:
    """Build a storage record from a submission. Returns (record, output_hash)."""
    hash_input = f"{submission.model_id}|{submission.prompt_id}|{submission.output}"
    output_hash = hashlib.sha256(hash_input.encode()).hexdigest()
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
    return record, output_hash


@router.post("/submit", response_model=SubmissionResponse)
async def submit_result(
    submission: SubmissionRequest,
    authorization: str | None = Header(None)
):
    """Submit a single test result."""
    user_id = validate_token(authorization)
    now = datetime.now(UTC)
    record, output_hash = _build_record(submission, user_id, now)

    record_ids = await write_records([record])

    return SubmissionResponse(
        status="accepted",
        id=record_ids[0],
        hash=f"sha256:{output_hash}",
    )


@router.post("/submit/batch")
async def submit_batch(
    batch: BatchSubmissionRequest,
    authorization: str | None = Header(None)
):
    """Submit batch of results. Writes ONE Parquet file with all rows."""
    user_id = validate_token(authorization)
    now = datetime.now(UTC)

    records = []
    hashes = []
    for result in batch.results:
        record, output_hash = _build_record(result, user_id, now)
        records.append(record)
        hashes.append(output_hash)

    record_ids = await write_records(records)

    return {
        "status": "completed",
        "submitted": len(record_ids),
        "results": [
            {"id": rid, "hash": f"sha256:{h}"}
            for rid, h in zip(record_ids, hashes)
        ],
    }
