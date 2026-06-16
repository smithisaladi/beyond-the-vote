import pytest
from tests.integration import seed

pytestmark = [pytest.mark.integration, pytest.mark.asyncio(loop_scope="session")]


async def test_health_ok(client):
    resp = await client.get("/healthz")
    assert resp.status_code == 200


async def test_seed_and_read_back(client, db):
    await seed.add_bill(db, bill_id="hr1-118", title="Clean Water Act", bill_number="H.R. 1")
    resp = await client.get("/api/bills/hr1-118")
    assert resp.status_code == 200
    assert resp.json()["bill"]["title"] == "Clean Water Act"


async def test_truncate_isolates(client):
    # Previous test's bill must be gone — proves per-test truncation.
    resp = await client.get("/api/bills/hr1-118")
    assert resp.status_code == 404
