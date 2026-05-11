# apps/api/tests/test_ml_endpoints.py
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_ml_endpoints_in_openapi():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    schema = resp.json()
    paths = list(schema["paths"].keys())
    assert any("funding-comparison" in p for p in paths), f"funding-comparison not in paths: {paths}"
    assert any("vote-prediction" in p for p in paths), f"vote-prediction not in paths: {paths}"
