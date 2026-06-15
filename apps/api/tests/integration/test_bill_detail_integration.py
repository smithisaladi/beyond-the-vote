import pytest
from tests.integration import seed

pytestmark = [pytest.mark.integration, pytest.mark.asyncio(loop_scope="session")]


async def test_bill_detail_includes_votes_and_actions(client, db):
    await seed.add_legislator(db, bioguide_id="L000001", full_name="Jane Doe", party="Democrat")
    await seed.add_bill(db, bill_id="hr1-118", title="Clean Water Act", bill_number="H.R. 1",
                        summary="Protects water.", policy_area="Environmental Protection")
    await seed.add_vote(db, vote_id="v1", bill_id="hr1-118", question="On Passage", result="Passed")
    await seed.add_vote_position(db, vote_id="v1", bioguide_id="L000001", position="Yea")
    await seed.add_action(db, bill_id="hr1-118", acted_at="2023-04-01", text_="Passed House")

    r = await client.get("/api/bills/hr1-118")
    assert r.status_code == 200
    bill = r.json()["bill"]
    assert bill["title"] == "Clean Water Act"
    assert bill["policyArea"] == "Environmental Protection"
    assert len(bill["votes"]) == 1
    assert bill["votes"][0]["result"] == "Passed"
    member = bill["votes"][0]["memberPositions"][0]
    assert member["bioguide_id"] == "L000001"
    assert member["position"] == "Yea"
    assert any(a["text"] == "Passed House" for a in bill["actions"])


async def test_lookup_by_bill_number_case_insensitive(client, db):
    await seed.add_bill(db, bill_id="hr1-118", title="Clean Water Act", bill_number="H.R. 1")
    r = await client.get("/api/bills/h.r. 1")
    assert r.status_code == 200
    assert r.json()["bill"]["id"] == "hr1-118"


async def test_missing_bill_404(client):
    r = await client.get("/api/bills/nope-999")
    assert r.status_code == 404
