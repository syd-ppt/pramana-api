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

from backend.storage.client import StorageClient

router = APIRouter()
logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=16)


def _download_file(client: StorageClient, key: str) -> dict[str, list]:
    """Download and parse a single parquet file. Returns column dict."""
    data = client.download_file(key)
    table = pq.read_table(BytesIO(data))
    return table.to_pydict()


def _list_and_download(client: StorageClient, start_date: str, end_date: str) -> dict:
    """List files matching date range and download them.

    Returns combined column dict: {col_name: [values...]}.
    """
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")

    # Collect matching file names by iterating date prefixes
    matching_files: list[str] = []
    current = start
    while current <= end:
        prefix = f"year={current.year}/month={current.month:02d}/day={current.day:02d}/"
        matching_files.extend(
            k for k in client.list_files(prefix=prefix)
            if k.endswith(".parquet")
        )
        current += timedelta(days=1)

    if not matching_files:
        return {}

    # Download in parallel
    combined: dict[str, list] = defaultdict(list)
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = {
            pool.submit(_download_file, client, key): key
            for key in matching_files
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
    """Instantiate client and run _list_and_download inside executor."""
    client = StorageClient()
    return _list_and_download(client, start_date, end_date)


@router.get("/data/chart")
async def get_chart_data(
    start_date: str | None = Query(None, description="YYYY-MM-DD"),
    end_date: str | None = Query(None, description="YYYY-MM-DD"),
    models: str | None = Query(None, description="Comma-separated model IDs"),
):
    """Get aggregated chart data from parquet files.

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

        ts = timestamps[i]
        if hasattr(ts, "strftime"):
            date_str = ts.strftime("%Y-%m-%d")
        elif hasattr(ts, "as_py"):
            date_str = ts.as_py().strftime("%Y-%m-%d")
        else:
            date_str = str(ts)[:10]

        counts[date_str][model] += 1

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
