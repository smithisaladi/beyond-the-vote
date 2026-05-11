# apps/api/tests/test_routers.py
"""Smoke tests to verify all routers are registered."""
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_all_routers_registered():
    """Verify all expected route prefixes exist in the app."""
    route_paths = [r.path for r in app.routes]
    # Check that each router prefix appears in at least one route
    expected_prefixes = ["/healthz", "/api/bills", "/api/politicians", "/api/donors", "/api/dashboard", "/api/representatives"]
    for prefix in expected_prefixes:
        found = any(prefix in path for path in route_paths)
        assert found, f"Route prefix {prefix} not found in app routes: {route_paths}"


@pytest.mark.asyncio
async def test_openapi_schema_generates():
    """Verify OpenAPI schema generates without errors."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    schema = resp.json()
    assert "paths" in schema
    # Verify key paths exist in schema
    paths = list(schema["paths"].keys())
    assert any("/api/bills" in p for p in paths), f"Bills not in OpenAPI paths: {paths}"
    assert any("/api/politicians" in p for p in paths), f"Politicians not in OpenAPI paths: {paths}"
    assert any("/api/donors" in p for p in paths), f"Donors not in OpenAPI paths: {paths}"
