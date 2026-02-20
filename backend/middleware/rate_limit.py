"""IP-based rate limiting middleware."""

import time
from collections import defaultdict
from typing import Dict, List

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limit requests by IP address."""

    def __init__(self, app, max_requests: int = 60, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: Dict[str, List[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        """Check rate limit before processing request."""
        client_ip = request.client.host if request.client else "unknown"

        # Clean old requests
        now = time.time()
        self.requests[client_ip] = [
            ts for ts in self.requests[client_ip]
            if now - ts < self.window_seconds
        ]

        # Check limit
        if len(self.requests[client_ip]) >= self.max_requests:
            return Response(
                content="Rate limit exceeded",
                status_code=429,
                headers={"Retry-After": str(self.window_seconds)},
            )

        # Record request
        self.requests[client_ip].append(now)

        # Process request
        return await call_next(request)
