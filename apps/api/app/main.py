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


async def _load_models_background() -> None:
    """Load ML models in background so the server starts accepting requests immediately."""
    try:
        from app.ml import load_all_models
        if settings.database_url:
            from app.deps import _get_session_factory
            factory = _get_session_factory()
            async with factory() as session:
                await load_all_models(db_session=session)
        else:
            await load_all_models()
    except Exception:
        log.exception("background_model_load_failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("app_starting", environment=settings.environment)
    import asyncio
    asyncio.create_task(_load_models_background())
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
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


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

from app.routers import ml
app.include_router(ml.router)

from app.routers import donor_similarity
app.include_router(donor_similarity.router)

from app.routers import money_flow
app.include_router(money_flow.router)

from app.routers import research
app.include_router(research.router)
