"""Integration test harness — real Postgres (pgvector + pg_trgm).

Set TEST_DATABASE_URL to a plain DSN, e.g.
  TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres
Locally that is the docker-compose.test.yml DB (host port 5433); in CI it is
the service container on localhost:5432. If unset, the whole integration suite
skips so the mock-only unit tests still run anywhere.
"""
import os
import pathlib
import uuid

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine

from app.main import app
from app.db.session import async_session_factory
from app.deps import get_current_user, get_optional_user

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
SCHEMA_SQL = pathlib.Path(__file__).resolve().parents[4] / "pipeline" / "schema.sql"
TEST_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")

# All schemas defined by schema.sql — truncated between tests for isolation.
_SCHEMAS = ("congress", "fec", "enrichment", "analytics", "app", "derived", "ops")


def _async_url(dsn: str) -> str:
    return dsn.replace("postgresql://", "postgresql+asyncpg://", 1)


@pytest.fixture(scope="session")
def _require_db():
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set — skipping integration suite")
    return TEST_DATABASE_URL


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def _bootstrapped(_require_db):
    """Create the full schema once per session via raw asyncpg (simple-query
    protocol handles the multi-statement file, incl. the dollar-quoted trigger)."""
    conn = await asyncpg.connect(_require_db)
    try:
        # Drop+recreate schemas so a dirty DB from a prior run can't poison us.
        for s in _SCHEMAS:
            await conn.execute(f"DROP SCHEMA IF EXISTS {s} CASCADE")
        await conn.execute(SCHEMA_SQL.read_text())
    finally:
        await conn.close()
    return True


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def engine(_bootstrapped, _require_db):
    eng = create_async_engine(_async_url(_require_db), pool_pre_ping=True)
    yield eng
    await eng.dispose()


@pytest.fixture(scope="session")
def session_factory(engine):
    return async_session_factory(engine)


@pytest_asyncio.fixture(autouse=True, loop_scope="session")
async def _truncate(engine):
    """Wipe all tables before each test (commit-based isolation)."""
    from sqlalchemy import text
    async with engine.begin() as conn:
        rows = await conn.execute(text(
            "SELECT schemaname, tablename FROM pg_tables WHERE schemaname = ANY(:s)"
        ), {"s": list(_SCHEMAS)})
        tables = [f'{r.schemaname}."{r.tablename}"' for r in rows]
        if tables:
            await conn.execute(text(
                f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE"
            ))
    yield


@pytest.fixture(autouse=True)
def _wire_app(session_factory):
    """Point the app at the test DB and disable rate limiting for determinism.
    get_db reads request.app.state.session_factory, and politician_detail opens
    its own sessions from the same factory — so this one wiring covers both."""
    app.state.session_factory = session_factory
    app.state.limiter.enabled = False
    yield
    app.state.limiter.enabled = True


@pytest_asyncio.fixture(loop_scope="session")
async def db(session_factory):
    """A committing session for seeding inside tests."""
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture(loop_scope="session")
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture(loop_scope="session")
async def authed_client():
    async def _user():
        return {"user_id": TEST_USER_ID, "payload": {"sub": str(TEST_USER_ID)}}

    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_optional_user] = _user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def disable_embeddings(monkeypatch):
    """Force the FTS+trigram fallback path in the bills router."""
    monkeypatch.setattr("app.routers.bills.embeddings_enabled", lambda: False)


@pytest.fixture
def stub_embedding(monkeypatch):
    """Enable semantic search with a caller-supplied query vector.

    Usage: vec = stub_embedding([0.1]*384)
    """
    def _install(vector):
        async def _embed(_text):
            return vector
        monkeypatch.setattr("app.routers.bills.embeddings_enabled", lambda: True)
        monkeypatch.setattr("app.routers.bills.embed_query", _embed)
        return vector
    return _install
