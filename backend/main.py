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
    storage_configured = bool(
        os.getenv("R2_ENDPOINT_URL")
        and os.getenv("R2_ACCESS_KEY_ID")
        and os.getenv("R2_SECRET_ACCESS_KEY")
        and os.getenv("R2_BUCKET_NAME")
    )

    return {
        "status": "healthy",
        "storage_configured": storage_configured,
    }


# Vercel will auto-detect the `app` export for FastAPI
