#!/usr/bin/env python3
"""
Backfill R2 with pre-aggregated data from existing parquet files.

Run once before deploying the new architecture:
  uv run python scripts/backfill.py

Creates:
  _aggregated/chart_data.json     — aggregate chart data
  _users/{user_id}/summary.json   — per-user summaries
  _archive/YYYY-MM-DD.csv.gz      — daily CSV archives from parquets
  _buffer/buffer.csv.gz           — empty buffer (headers only)
"""
from __future__ import annotations

import gzip
import json
import logging
import os
import sys
from collections import defaultdict
from datetime import datetime
from io import BytesIO
from pathlib import Path

import boto3
import pyarrow.parquet as pq
from dotenv import load_dotenv

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(
            f"backfill_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
        ),
    ],
)
log = logging.getLogger(__name__)

# Load env from project root
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

CSV_HEADERS = "id,timestamp,user_id,model_id,prompt_id,output,output_hash,metadata_json,year,month,day"


def get_s3_client():
    endpoint = os.environ["STORAGE_ENDPOINT_URL"]
    access_key = os.environ["STORAGE_ACCESS_KEY_ID"]
    secret_key = os.environ["STORAGE_SECRET_ACCESS_KEY"]
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )


def get_bucket():
    return os.environ["STORAGE_BUCKET_NAME"]


def list_all_parquets(s3, bucket: str) -> list[str]:
    keys = []
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix="year="):
        for obj in page.get("Contents", []):
            if obj["Key"].endswith(".parquet"):
                keys.append(obj["Key"])
    log.info("Found %d parquet files", len(keys))
    return keys


def escape_csv(value: str) -> str:
    if any(c in value for c in (",", '"', "\n", "\r")):
        return '"' + value.replace('"', '""') + '"'
    return value


def main():
    s3 = get_s3_client()
    bucket = get_bucket()

    parquet_keys = list_all_parquets(s3, bucket)
    if not parquet_keys:
        log.warning("No parquet files found. Nothing to backfill.")
        sys.exit(0)

    # Aggregation accumulators
    chart_data: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    user_summaries: dict[str, dict] = {}  # user_id -> {date_counts, total_submissions}
    daily_rows: dict[str, list[str]] = defaultdict(list)  # date -> CSV rows
    total = 0
    all_models: set[str] = set()

    for i, key in enumerate(parquet_keys):
        try:
            resp = s3.get_object(Bucket=bucket, Key=key)
            data = resp["Body"].read()
            table = pq.read_table(BytesIO(data))
            d = table.to_pydict()

            n = len(d.get("model_id", []))
            total += n

            for j in range(n):
                model_id = d["model_id"][j]
                user_id = d.get("user_id", ["anonymous"] * n)[j]
                ts = d.get("timestamp", [None] * n)[j]
                year = d.get("year", [0] * n)[j]
                month = d.get("month", [0] * n)[j]
                day = d.get("day", [0] * n)[j]
                date_str = f"{year}-{month:02d}-{day:02d}"

                all_models.add(model_id)

                # Chart aggregation
                chart_data[date_str][model_id] += 1

                # User summary
                if user_id not in user_summaries:
                    user_summaries[user_id] = {
                        "date_counts": defaultdict(lambda: defaultdict(int)),
                        "total_submissions": 0,
                    }
                user_summaries[user_id]["date_counts"][date_str][model_id] += 1
                user_summaries[user_id]["total_submissions"] += 1

                # CSV row for archive
                rec_id = d.get("id", [""] * n)[j] or ""
                timestamp_str = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
                output = d.get("output", [""] * n)[j] or ""
                output_hash = d.get("output_hash", [""] * n)[j] or ""
                metadata_json = d.get("metadata_json", ["{}"] * n)[j] or "{}"

                row = ",".join([
                    escape_csv(str(rec_id)),
                    escape_csv(timestamp_str),
                    escape_csv(str(user_id)),
                    escape_csv(str(model_id)),
                    escape_csv(str(d.get("prompt_id", [""] * n)[j] or "")),
                    escape_csv(output),
                    escape_csv(output_hash),
                    escape_csv(metadata_json),
                    str(year),
                    str(month),
                    str(day),
                ])
                daily_rows[date_str].append(row)

            if (i + 1) % 50 == 0:
                log.info("Processed %d/%d parquets (%d records)", i + 1, len(parquet_keys), total)

        except Exception:
            log.exception("Failed to process %s", key)

    log.info("Total records: %d across %d models", total, len(all_models))

    # 1. Upload chart_data.json
    chart_json = {
        "data": {k: dict(v) for k, v in sorted(chart_data.items())},
        "models": sorted(all_models),
        "total_submissions": total,
    }
    s3.put_object(
        Bucket=bucket,
        Key="_aggregated/chart_data.json",
        Body=json.dumps(chart_json).encode(),
    )
    log.info("Uploaded _aggregated/chart_data.json")

    # 2. Upload per-user summaries
    for user_id, summary in user_summaries.items():
        s3.put_object(
            Bucket=bucket,
            Key=f"_users/{user_id}/summary.json",
            Body=json.dumps({
                "date_counts": {
                    k: dict(v) for k, v in summary["date_counts"].items()
                },
                "total_submissions": summary["total_submissions"],
            }).encode(),
        )
    log.info("Uploaded %d user summaries", len(user_summaries))

    # 3. Upload daily archives
    for date_str, rows in sorted(daily_rows.items()):
        csv_content = CSV_HEADERS + "\n" + "\n".join(rows)
        compressed = gzip.compress(csv_content.encode(), compresslevel=9)
        s3.put_object(
            Bucket=bucket,
            Key=f"_archive/{date_str}.csv.gz",
            Body=compressed,
        )
    log.info("Uploaded %d daily archives", len(daily_rows))

    # 4. Initialize empty buffer
    empty_buffer = gzip.compress((CSV_HEADERS + "\n").encode(), compresslevel=9)
    s3.put_object(
        Bucket=bucket,
        Key="_buffer/buffer.csv.gz",
        Body=empty_buffer,
    )
    log.info("Initialized empty buffer")

    log.info("Backfill complete.")


if __name__ == "__main__":
    main()
