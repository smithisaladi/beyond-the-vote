import pytest
from tests.integration import seed

pytestmark = [pytest.mark.integration, pytest.mark.asyncio(loop_scope="session")]


async def test_politician_detail_with_funding(client, db):
    await seed.add_legislator(db, bioguide_id="L000001", full_name="Jane Doe",
                              party="Democrat", state="CA", state_full="California")
    await seed.add_funding_summary(db, bioguide_id="L000001", pac_direct_total=100000,
                                   large_donor_total=50000, small_donor_total=50000)

    r = await client.get("/api/politicians/L000001")
    assert r.status_code == 200
    pol = r.json()["politician"]
    assert pol["name"] == "Jane Doe"
    funding = pol["fundingBreakdown"]
    assert funding["pac"] == 100000.0
    assert funding["total"] == 200000.0
    assert funding["pacPct"] == 50.0  # 100k of 200k


async def test_politician_search_by_name(client, db):
    await seed.add_legislator(db, bioguide_id="L000001", full_name="Jane Doe")
    r = await client.get("/api/politicians/search", params={"q": "Doe"})
    assert r.status_code == 200
    assert [p["id"] for p in r.json()["politicians"]] == ["L000001"]


async def test_politician_missing_404(client):
    r = await client.get("/api/politicians/NOPE")
    assert r.status_code == 404
