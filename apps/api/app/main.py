# apps/api/app/main.py
"""FastAPI application with middleware, Sentry, and routers."""
from contextlib import asynccontextmanager

import sentry_sdk
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.logging import configure_logging
from app.middleware.request_id import RequestIDMiddleware

configure_logging(debug=settings.debug)
log = structlog.get_logger()

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=0.1,
    )

limiter = Limiter(key_func=get_remote_address, default_limits=[settings.rate_limit])


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("app_starting", environment=settings.environment)
    yield
    log.info("app_shutting_down")


app = FastAPI(
    title="Beyond the Ballot API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
