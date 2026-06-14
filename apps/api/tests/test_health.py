import pytest
from unittest.mock import AsyncMock, MagicMock


class MockMappingResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class MockResult:
    def __init__(self, rows=None, scalar=None):
        self._rows = rows or []
        self._scalar = scalar

    def mappings(self):
        return MockMappingResult(self._rows)

    def scalar_one_or_none(self):
        return self._scalar


@pytest.mark.asyncio
async def test_healthz_returns_200(client, mock_db):
    # SELECT 1 succeeds; freshness query returns empty (no stale tables)
    mock_db.execute = AsyncMock(return_value=MockResult(rows=[]))
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] in ("healthy", "unhealthy")
    assert "db" in body
    assert "embedding_model" in body
    assert "data_freshness" in body
    assert "latency_ms" in body


@pytest.mark.asyncio
async def test_healthz_db_field_true(client, mock_db):
    mock_db.execute = AsyncMock(return_value=MockResult(rows=[]))
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    body = resp.json()
    assert body["db"] is True
