"""FastAPI application entry point - Serverless-optimized for Vercel."""
from __future__ import annotations

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.middleware.rate_limit import RateLimitMiddleware
from backend.routes import data, submit, user

# Create app
app = FastAPI(
    title="Pramana API",
    description="Crowdsourced LLM drift detection platform",
    version="0.1.0",
)

# CORS middleware - restrict to your domain in production
ENVIRONMENT = os.getenv("ENVIRONMENT") or os.getenv("VERCEL_ENV") or "development"
_is_production = ENVIRONMENT not in ("development", "preview")

cors_raw = os.getenv("CORS_ORIGINS")
if _is_production and not cors_raw:
    import logging as _log
    _log.warning(
        "CORS_ORIGINS not set in production — defaulting to restrictive policy. "
        "Set CORS_ORIGINS=https://yourdomain.com in environment."
    )
    CORS_ORIGINS: list[str] = []
elif cors_raw:
    CORS_ORIGINS = cors_raw.split(",")
else:
    CORS_ORIGINS = ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting (60 requests per minute per IP)
app.add_middleware(RateLimitMiddleware, max_requests=60, window_seconds=60)

# Include routes with /api prefix
app.include_router(submit.router, prefix="/api", tags=["submission"])
app.include_router(user.router, prefix="/api", tags=["user"])
app.include_router(data.router, prefix="/api", tags=["data"])


@app.get("/api")
async def root():
    """API status endpoint."""
    return {"status": "ok", "service": "pramana-api", "version": "0.1.0"}


@app.get("/api/health")
async def health():
    """Health check for load balancers."""
    import asyncio

    b2_configured = bool(
        (os.getenv("B2_KEY_ID") or os.getenv("B2_APPLICATION_KEY_ID"))
        and os.getenv("B2_APPLICATION_KEY")
        and os.getenv("B2_BUCKET_NAME")
    )

    b2_connection = "not_tested"
    b2_file_count = 0
    b2_sample_files: list[str] = []

    if b2_configured:
        try:
            from backend.storage.b2_client import B2Client

            loop = asyncio.get_running_loop()
            client = await loop.run_in_executor(None, B2Client)
            count = 0
            samples: list[str] = []
            for fv, _ in client.bucket.ls(recursive=True):
                count += 1
                if len(samples) < 5:
                    samples.append(fv.file_name)
                if count >= 100:
                    break
            b2_connection = "success"
            b2_file_count = count
            b2_sample_files = samples
        except Exception as exc:
            b2_connection = f"error: {exc}"

    return {
        "status": "healthy",
        "b2_configured": b2_configured,
        "b2_connection": b2_connection,
        "b2_file_count": b2_file_count,
        "b2_sample_files": b2_sample_files,
    }


@app.get("/api/debug/b2-list")
async def debug_b2_list(prefix: str = "year=2026/month=02/day=13/"):
    """Temporary debug: test B2 listing with a specific prefix."""
    import asyncio
    from backend.storage.b2_client import B2Client

    loop = asyncio.get_running_loop()
    client = await loop.run_in_executor(None, B2Client)

    results: dict = {"prefix": prefix, "files": [], "error": None}
    try:
        for fv, _ in client.bucket.ls(folder_to_list=prefix, recursive=True):
            results["files"].append(fv.file_name)
            if len(results["files"]) >= 10:
                break
    except Exception as exc:
        results["error"] = f"{type(exc).__name__}: {exc}"

    # Also try without folder_to_list for comparison
    results["raw_ls_sample"] = []
    try:
        for fv, _ in client.bucket.ls(recursive=True):
            if fv.file_name.startswith(prefix):
                results["raw_ls_sample"].append(fv.file_name)
                if len(results["raw_ls_sample"]) >= 5:
                    break
    except Exception as exc:
        results["raw_ls_error"] = f"{type(exc).__name__}: {exc}"

    return results


@app.get("/api/debug/chart-trace")
async def debug_chart_trace():
    """Trace chart listing logic step-by-step to find silent failures."""
    import asyncio
    import traceback as tb
    from backend.storage.b2_client import B2Client

    trace: list[str] = []

    def run():
        try:
            client = B2Client()
            trace.append("B2Client OK")
        except Exception as exc:
            trace.append(f"B2Client FAILED: {exc}")
            return {}

        prefix = "year=2026/month=02/day=13/"
        trace.append(f"prefix={prefix}")

        # Step 1: raw listing
        try:
            files = []
            for fv, _ in client.bucket.ls(folder_to_list=prefix, recursive=True):
                files.append(fv.file_name)
                if len(files) >= 3:
                    break
            trace.append(f"ls OK: {len(files)} files")
        except Exception as exc:
            trace.append(f"ls FAILED: {type(exc).__name__}: {exc}\n{tb.format_exc()}")
            return {}

        # Step 2: download first file
        if files:
            from io import BytesIO
            import pyarrow.parquet as pq
            try:
                buf = BytesIO()
                client.bucket.download_file_by_name(files[0]).save(buf)
                buf.seek(0)
                table = pq.read_table(buf)
                d = table.to_pydict()
                trace.append(f"download OK: cols={list(d.keys())}, rows={len(d.get('model_id', []))}")
                return d
            except Exception as exc:
                trace.append(f"download FAILED: {type(exc).__name__}: {exc}\n{tb.format_exc()}")
                return {}
        return {}

    loop = asyncio.get_running_loop()
    data = await loop.run_in_executor(None, run)
    return {"trace": trace, "data_keys": list(data.keys()), "row_count": len(data.get("model_id", []))}



# Vercel will auto-detect the `app` export for FastAPI
