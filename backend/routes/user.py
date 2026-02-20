"""User management API routes - GDPR compliance."""
from __future__ import annotations

import asyncio
import logging
from io import BytesIO

import pyarrow.parquet as pq
from fastapi import APIRouter, Header, HTTPException, Query

from backend.storage.client import StorageClient
from backend.routes.submit import validate_token

router = APIRouter()

MAX_STATS_FILES = 500


def gather_user_stats(client: StorageClient, user_id: str) -> dict:
    """Aggregate submission stats for a user from Parquet files.

    Lists all files, filters by user partition, downloads and aggregates.
    """
    all_keys = client.list_files(max_keys=MAX_STATS_FILES)
    user_keys = [
        k for k in all_keys
        if f"/user={user_id}/" in k and k.endswith(".parquet")
    ]

    models_seen: set[str] = set()
    total = 0
    latest_ts = None

    for key in user_keys:
        try:
            data = client.download_file(key)
            table = pq.read_table(BytesIO(data))
            d = table.to_pydict()
            total += len(d.get("model_id", []))
            for mid in d.get("model_id", []):
                models_seen.add(mid)
            for ts in d.get("timestamp", []):
                dt = ts.as_py() if hasattr(ts, "as_py") else ts
                if latest_ts is None or dt > latest_ts:
                    latest_ts = dt
        except Exception:
            logging.exception("Failed reading %s", key)

    return {
        "user_id": user_id,
        "total_submissions": total,
        "models_tested": sorted(models_seen),
        "models_count": len(models_seen),
        "last_submission": latest_ts.isoformat() if latest_ts else None,
    }


@router.delete("/user/me")
async def delete_my_data(
    authorization: str = Header(...),
    anonymize_only: bool = Query(False, description="Keep results as anonymous instead of deletion")
):
    """Delete or anonymize user data (GDPR compliance)."""
    user_id = validate_token(authorization)

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Authentication required for data deletion"
        )

    loop = asyncio.get_running_loop()
    client = await loop.run_in_executor(None, StorageClient)

    if anonymize_only:
        count = await client.repartition_user_data(
            from_user_id=user_id,
            to_user_id="anonymous"
        )
        return {
            "status": "anonymized",
            "user_id": user_id,
            "files_moved": count,
            "message": "Your submissions are now anonymous but still contribute to crowd statistics"
        }
    else:
        count = await client.delete_user_data(user_id)
        return {
            "status": "deleted",
            "user_id": user_id,
            "files_deleted": count,
            "message": "All your data has been permanently deleted"
        }


@router.get("/user/me/stats")
async def get_my_stats(authorization: str = Header(...)):
    """Get personalized statistics for authenticated user."""
    user_id = validate_token(authorization)

    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    loop = asyncio.get_running_loop()
    client = await loop.run_in_executor(None, StorageClient)

    stats = await loop.run_in_executor(None, gather_user_stats, client, user_id)
    return stats
