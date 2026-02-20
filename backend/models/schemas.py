"""Pydantic schemas for API."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SubmissionRequest(BaseModel):
    """Single test result submission."""

    model_id: str = Field(max_length=256)
    prompt_id: str = Field(max_length=256)
    output: str = Field(max_length=1_048_576)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SubmissionResponse(BaseModel):
    """Response from submission endpoint."""

    status: str  # "accepted" or "duplicate"
    id: str
    hash: str


class BatchSubmissionRequest(BaseModel):
    """Batch of test results."""

    suite_version: str
    suite_hash: str
    model_id: str
    temperature: float
    seed: int | None
    timestamp: datetime
    results: list[SubmissionRequest] = Field(max_length=1000)
