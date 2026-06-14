"""Request ID + timing middleware — logs per-request metrics."""
import time
import uuid
import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

log = structlog.get_logger()
_SLOW_THRESHOLD_MS = 2000


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = str(uuid.uuid4())
        start = time.monotonic()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        try:
            response = await call_next(request)
        finally:
            duration_ms = round((time.monotonic() - start) * 1000, 1)
            logger = log.warning if duration_ms > _SLOW_THRESHOLD_MS else log.info
            logger(
                "request_complete",
                method=request.method,
                path=request.url.path,
                status=getattr(response, 'status_code', 500) if 'response' in dir() else 500,
                duration_ms=duration_ms,
            )
            structlog.contextvars.unbind_contextvars("request_id")
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = str(duration_ms)
        return response
