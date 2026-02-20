"""FastAPI application entry point - Serverless-optimized for Vercel."""
from __future__ import annotations

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.middleware.rate_limit import RateLimitMiddleware
from api.routes import data, submit, user

# Create app
app = FastAPI(
    title="Pramana API",
    description="Crowdsourced LLM drift detection platform",
    version="0.1.0",
)

# CORS middleware - restrict to your domain in production
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

if ENVIRONMENT != "development":
    cors_raw = os.getenv("CORS_ORIGINS")
    if not cors_raw:
        raise RuntimeError(
            "CORS_ORIGINS must be set in production. "
            "Example: CORS_ORIGINS=https://yourdomain.com"
        )
    CORS_ORIGINS = cors_raw.split(",")
else:
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

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
    b2_configured = bool(
        (os.getenv("B2_KEY_ID") or os.getenv("B2_APPLICATION_KEY_ID"))
        and os.getenv("B2_APPLICATION_KEY")
        and os.getenv("B2_BUCKET_NAME")
    )

    return {
        "status": "healthy",
        "b2_configured": b2_configured,
    }


# Vercel will auto-detect the `app` export for FastAPI
