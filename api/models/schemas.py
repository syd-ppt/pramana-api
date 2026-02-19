"""Pydantic schemas for API."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SubmissionRequest(BaseModel):
    """Single test result submission."""

    model_id: str
    prompt_id: str
    output: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SubmissionResponse(BaseModel):
    """Response from submission endpoint."""

    status: str  # "success" or "duplicate"
    id: str
    hash: str


class BatchSubmissionRequest(BaseModel):
    """Batch of test results."""

    suite_version: str
    suite_hash: str
    model_id: str
    temperature: float
    seed: Optional[int]
    timestamp: datetime
    results: List[SubmissionRequest]
