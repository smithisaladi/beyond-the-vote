import pytest
from tests.integration import seed

pytestmark = [pytest.mark.integration, pytest.mark.asyncio(loop_scope="session")]


async def test_inbound_flow_builds_graph(client, db):
    await seed.add_committee_name(db, cmte_id="C-DEST", name="Main PAC")
    await seed.add_committee_name(db, cmte_id="C-ORIG", name="Mega Donor PAC")
    await seed.add_money_flow(db, destination_committee_id="C-DEST", origin_entity_id="C-ORIG",
                              attributed_amount=75000, hop_count=2, path=["C-MID"])

    r = await client.get("/api/money-flow/C-DEST", params={"direction": "inbound"})
    assert r.status_code == 200
    body = r.json()
    assert body["entityName"] == "Main PAC"
    assert body["totalFlow"] == 75000.0
    node_ids = {n["id"] for n in body["nodes"]}
    assert {"C-DEST", "C-ORIG", "C-MID"} <= node_ids  # intermediate from path added
    assert body["edges"][0]["from"] == "C-ORIG"
    assert body["edges"][0]["to"] == "C-DEST"


async def test_unknown_entity_404(client):
    r = await client.get("/api/money-flow/NOPE")
    assert r.status_code == 404


async def test_known_entity_no_flows_returns_empty(client, db):
    await seed.add_committee_name(db, cmte_id="C-LONE", name="Lonely PAC")
    r = await client.get("/api/money-flow/C-LONE")
    assert r.status_code == 200
    assert r.json()["flows"] == []
