"""Shared fixtures for API tests — mock DB session and async HTTP client."""
import pytest
from unittest.mock import AsyncMock, MagicMock

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.deps import get_db, get_current_user, get_optional_user


class MockMappingResult:
    """Simulate SQLAlchemy MappingResult from execute().mappings()."""

    def __init__(self, rows: list[dict]):
        self._rows = rows

    def all(self) -> list[dict]:
        return self._rows

    def first(self) -> dict | None:
        return self._rows[0] if self._rows else None


class MockResult:
    """Simulate SQLAlchemy Result object returned by session.execute()."""

    def __init__(self, rows: list[dict] | None = None, scalar: object = None):
        self._rows = rows or []
        self._scalar = scalar

    def mappings(self) -> MockMappingResult:
        return MockMappingResult(self._rows)

    def scalar_one_or_none(self):
        return self._scalar


def make_mock_result(rows: list[dict]) -> MockResult:
    """Create a MockResult from a list of row dicts."""
    return MockResult(rows=rows)


def make_scalar_result(value) -> MockResult:
    """Create a MockResult that returns a scalar value."""
    return MockResult(scalar=value)


@pytest.fixture
def mock_db():
    """Async mock for SQLAlchemy AsyncSession."""
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    return session


@pytest.fixture
def mock_user():
    """A fake authenticated user dict."""
    return {"user_id": "test-user-123", "payload": {"sub": "test-user-123"}}


@pytest.fixture
async def client(mock_db):
    """AsyncClient with get_db overridden to return mock session."""
    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
async def authed_client(mock_db, mock_user):
    """AsyncClient with both get_db and get_current_user overridden."""
    async def override_get_db():
        yield mock_db

    async def override_get_current_user():
        return mock_user

    async def override_get_optional_user():
        return mock_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_optional_user] = override_get_optional_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
