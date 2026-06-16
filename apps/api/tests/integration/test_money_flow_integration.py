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


async def test_donor_money_flow_funders_ranked_by_amount_across_cycles(client, db):
    """Top funders must be ordered by total giving aggregated across cycles, not by
    the per-(cmte, cycle) rank column (which interleaves cycles)."""
    await seed.add_committee_name(db, cmte_id="C-FUND", name="Funded PAC")
    # rank-1 in 2026 is a small donor; rank-1 in 2024 is the real heavyweight.
    await seed.add_pac_top_funder(db, cmte_id="C-FUND", canonical_donor_id="small",
                                  display_name="SMALL, SAM", total_amount=5000, rank=1, cycle=2026)
    await seed.add_pac_top_funder(db, cmte_id="C-FUND", canonical_donor_id="big",
                                  display_name="BIG, BETTY", total_amount=19000000, rank=1, cycle=2024)
    await seed.add_pac_top_funder(db, cmte_id="C-FUND", canonical_donor_id="mid",
                                  display_name="MID, MARY", total_amount=11000000, rank=2, cycle=2024)

    r = await client.get("/api/donors/C-FUND/money-flow")
    assert r.status_code == 200
    funders = r.json()["topFunders"]
    assert [f["name"] for f in funders] == ["BIG, BETTY", "MID, MARY", "SMALL, SAM"]
    assert [f["totalAmount"] for f in funders] == [19000000.0, 11000000.0, 5000.0]


async def test_donor_money_flow_funder_summed_across_cycles(client, db):
    """A donor who gave in both cycles is merged into one row with the summed total."""
    await seed.add_committee_name(db, cmte_id="C-SUM", name="Summed PAC")
    await seed.add_pac_top_funder(db, cmte_id="C-SUM", canonical_donor_id="d1",
                                  display_name="GIVER, GREG", total_amount=300000, rank=1, cycle=2024)
    await seed.add_pac_top_funder(db, cmte_id="C-SUM", canonical_donor_id="d1",
                                  display_name="GIVER, GREG", total_amount=200000, rank=1, cycle=2026)

    r = await client.get("/api/donors/C-SUM/money-flow")
    assert r.status_code == 200
    funders = r.json()["topFunders"]
    assert len(funders) == 1
    assert funders[0]["totalAmount"] == 500000.0


async def test_unknown_entity_404(client):
    r = await client.get("/api/money-flow/NOPE")
    assert r.status_code == 404


async def test_known_entity_no_flows_returns_empty(client, db):
    await seed.add_committee_name(db, cmte_id="C-LONE", name="Lonely PAC")
    r = await client.get("/api/money-flow/C-LONE")
    assert r.status_code == 200
    assert r.json()["flows"] == []
