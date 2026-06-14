"""FastAPI application with middleware, Sentry, and routers."""
from contextlib import asynccontextmanager

import sentry_sdk
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware
from starlette.requests import Request

from app.config import settings
from app.db.session import get_engine, async_session_factory
from app.logging import configure_logging
from app.middleware.request_id import RequestIDMiddleware

configure_logging(debug=settings.debug)
log = structlog.get_logger()

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=0.3,
    )

def _rate_limit_key(request: Request) -> str:
    """Per-user rate limiting: authenticated users get their own bucket (120/min),
    unauthenticated users share IP-based buckets (30/min via default_limits)."""
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer ") and len(auth) > 7:
        import hashlib
        return f"user:{hashlib.sha256(auth[7:].encode()).hexdigest()[:16]}"
    return get_remote_address(request)

limiter = Limiter(
    key_func=_rate_limit_key,
    default_limits=["30/minute"],
    application_limits=["120/minute"],
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("app_starting", environment=settings.environment)
    engine = get_engine(settings.async_database_url)
    app.state.db_engine = engine
    app.state.session_factory = async_session_factory(engine)
    yield
    log.info("app_shutting_down")
    await engine.dispose()


app = FastAPI(
    title="Beyond the Ballot API",
    version="0.1.0",
    lifespan=lifespan,
)

# Middleware runs outermost-last: add_middleware prepends, so the last one added
# wraps everything. CORS must be outermost so rate-limit (429) and error responses
# still carry Access-Control-Allow-Origin — otherwise the browser reports them as
# CORS failures instead of the real status.
app.state.limiter = limiter
app.add_middleware(RequestIDMiddleware)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from app.routers import health
app.include_router(health.router)

from app.routers import bills
app.include_router(bills.router)

from app.routers import politicians
app.include_router(politicians.router)

from app.routers import donors
app.include_router(donors.router)

from app.routers import dashboard
app.include_router(dashboard.router)

from app.routers import representatives
app.include_router(representatives.router)

from app.routers import money_flow
app.include_router(money_flow.router)
