"""User management API routes - GDPR compliance."""
from __future__ import annotations

import asyncio
import logging
from io import BytesIO

import pyarrow.parquet as pq
from fastapi import APIRouter, Header, HTTPException, Query

from api.storage.b2_client import B2Client
from api.routes.submit import validate_token

router = APIRouter()

MAX_STATS_FILES = 500


def gather_user_stats(bucket, user_id: str) -> dict:
    """Aggregate submission stats for a user from Parquet files in B2.

    Args:
        bucket: B2 bucket object
        user_id: User ID to gather stats for

    Returns:
        Dict with total_submissions, models_tested, models_count, last_submission
    """
    target_segment = f"/user={user_id}/"
    models_seen: set[str] = set()
    total = 0
    latest_ts = None
    files_scanned = 0
    for file_version, _ in bucket.ls(recursive=True):
        files_scanned += 1
        if files_scanned > MAX_STATS_FILES:
            logging.warning("Stats scan capped at %d files for user %s", MAX_STATS_FILES, user_id)
            break
        if target_segment not in f"/{file_version.file_name}":
            continue
        if not file_version.file_name.endswith(".parquet"):
            continue
        try:
            buf = BytesIO()
            bucket.download_file_by_name(file_version.file_name).save(buf)
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
        except Exception:
            logging.exception("Failed reading %s", file_version.file_name)
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
    """Delete or anonymize user data (GDPR compliance).

    Args:
        authorization: Bearer token (required)
        anonymize_only: If True, keep results but remove user link.
                       If False, delete all user data completely.

    Returns:
        Status of deletion/anonymization
    """
    user_id = validate_token(authorization)

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Authentication required for data deletion"
        )

    loop = asyncio.get_running_loop()
    b2_client = await loop.run_in_executor(None, B2Client)

    if anonymize_only:
        try:
            await b2_client.repartition_user_data(
                from_user_id=user_id,
                to_user_id="anonymous"
            )
            return {
                "status": "anonymized",
                "user_id": user_id,
                "message": "Your submissions are now anonymous but still contribute to crowd statistics"
            }
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Anonymization failed: {str(e)}"
            )
    else:
        try:
            deleted_count = await b2_client.delete_user_data(user_id)
            return {
                "status": "deleted",
                "user_id": user_id,
                "files_deleted": deleted_count,
                "message": "All your data has been permanently deleted"
            }
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Deletion failed: {str(e)}"
            )


@router.get("/user/me/stats")
async def get_my_stats(authorization: str = Header(...)):
    """Get personalized statistics for authenticated user.

    Returns user's pass rates, submission count, and comparison to crowd averages.
    """
    user_id = validate_token(authorization)

    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    loop = asyncio.get_running_loop()
    b2_client = await loop.run_in_executor(None, B2Client)

    stats = await loop.run_in_executor(None, gather_user_stats, b2_client.bucket, user_id)
    return stats
