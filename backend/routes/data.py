"""Data query API routes - Dashboard data aggregation."""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime, timedelta
from io import BytesIO

import pyarrow.parquet as pq
from fastapi import APIRouter, Query

from backend.storage.b2_client import B2Client

router = APIRouter()
logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=16)


def _download_file(bucket, file_name: str) -> dict[str, list]:
    """Download and parse a single parquet file from B2. Returns column dict."""
    buf = BytesIO()
    bucket.download_file_by_name(file_name).save(buf)
    buf.seek(0)
    table = pq.read_table(buf)
    return table.to_pydict()


def _list_and_download(bucket, start_date: str, end_date: str) -> dict:
    """List B2 files matching date range and download them.

    Returns combined column dict: {col_name: [values...]}.
    """
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")

    # Collect matching file names by iterating date prefixes
    matching_files = []
    current = start
    while current <= end:
        prefix = f"year={current.year}/month={current.month:02d}/day={current.day:02d}/"
        try:
            for file_version, _ in bucket.ls(folder_to_list=prefix, recursive=True):
                if file_version.file_name.endswith(".parquet"):
                    matching_files.append(file_version.file_name)
        except Exception:
            logger.debug("No files for prefix %s", prefix)
        current += timedelta(days=1)

    if not matching_files:
        return {}

    # Download in parallel, collect column dicts
    combined: dict[str, list] = defaultdict(list)
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = {
            pool.submit(_download_file, bucket, fname): fname
            for fname in matching_files
        }
        for future in as_completed(futures):
            try:
                row_dict = future.result()
                for col, values in row_dict.items():
                    combined[col].extend(values)
            except Exception:
                logger.exception("Failed to download %s", futures[future])

    return dict(combined)


def _list_and_download_with_client(start_date: str, end_date: str) -> dict:
    """Instantiate B2Client and run _list_and_download inside executor."""
    b2_client = B2Client()
    return _list_and_download(b2_client.bucket, start_date, end_date)


@router.get("/data/chart")
async def get_chart_data(
    start_date: str | None = Query(None, description="YYYY-MM-DD"),
    end_date: str | None = Query(None, description="YYYY-MM-DD"),
    models: str | None = Query(None, description="Comma-separated model IDs"),
):
    """Get aggregated chart data from B2 parquet files.

    Returns daily submission counts per model, plus list of available models.
    """
    if not end_date:
        end_date = datetime.now(UTC).strftime("%Y-%m-%d")
    if not start_date:
        start_date = (datetime.now(UTC) - timedelta(days=30)).strftime("%Y-%m-%d")

    loop = asyncio.get_running_loop()
    data = await loop.run_in_executor(
        _executor,
        _list_and_download_with_client,
        start_date,
        end_date,
    )

    if not data or "model_id" not in data:
        return {"data": [], "models": [], "total_submissions": 0}

    total = len(data["model_id"])

    # Extract available models
    available_models = sorted(set(data["model_id"]))

    # Filter by requested models
    model_filter = None
    if models:
        model_filter = set(m.strip() for m in models.split(","))

    # Aggregate: count submissions per (date, model_id)
    counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    timestamps = data.get("timestamp", [])
    model_ids = data["model_id"]

    for i in range(total):
        model = model_ids[i]
        if model_filter and model not in model_filter:
            continue

        # Get date string from timestamp
        ts = timestamps[i]
        if hasattr(ts, "strftime"):
            date_str = ts.strftime("%Y-%m-%d")
        elif hasattr(ts, "as_py"):
            date_str = ts.as_py().strftime("%Y-%m-%d")
        else:
            date_str = str(ts)[:10]

        counts[date_str][model] += 1

    # Build chart data
    chart_data: list[dict[str, str | int]] = []
    for date in sorted(counts.keys()):
        row: dict[str, str | int] = {"date": date}
        row.update(counts[date])
        chart_data.append(row)

    return {
        "data": chart_data,
        "models": available_models,
        "total_submissions": total,
    }
