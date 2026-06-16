"""Auth-protected writes persist and read back through real SQL."""
import pytest
from tests.integration import seed

pytestmark = [pytest.mark.integration, pytest.mark.asyncio(loop_scope="session")]


async def test_follow_then_appears_in_followed(authed_client, db):
    await seed.add_legislator(db, bioguide_id="L000001", full_name="Jane Doe")
    r = await authed_client.post("/api/dashboard/follow/L000001")
    assert r.status_code == 200

    r = await authed_client.get("/api/dashboard/followed")
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()["politicians"]]
    assert ids == ["L000001"]


async def test_unfollow_removes(authed_client, db):
    await seed.add_legislator(db, bioguide_id="L000001", full_name="Jane Doe")
    await authed_client.post("/api/dashboard/follow/L000001")
    await authed_client.delete("/api/dashboard/follow/L000001")
    r = await authed_client.get("/api/dashboard/followed")
    assert r.json()["politicians"] == []


async def test_track_bill_round_trip(authed_client, db):
    await seed.add_bill(db, bill_id="hr1-118", title="Clean Water Act", bill_number="H.R. 1")
    r = await authed_client.post("/api/dashboard/track/hr1-118")
    assert r.status_code == 200
    r = await authed_client.get("/api/dashboard/tracked-bills")
    ids = [b["id"] for b in r.json()["bills"]]
    assert ids == ["hr1-118"]


async def test_activity_merges_votes_and_actions_newest_first(authed_client, db):
    await seed.add_legislator(db, bioguide_id="L000001", full_name="Jane Doe")
    await seed.add_bill(db, bill_id="hr1-118", title="Clean Water Act", bill_number="H.R. 1")
    # Followed politician's vote (older), tracked bill's action (newer).
    await authed_client.post("/api/dashboard/follow/L000001")
    await authed_client.post("/api/dashboard/track/hr1-118")
    await seed.add_vote(db, vote_id="v1", bill_id="hr1-118", date="2023-03-10")
    await seed.add_vote_position(db, vote_id="v1", bioguide_id="L000001", position="Yea")
    await seed.add_action(db, bill_id="hr1-118", acted_at="2023-03-15", text_="Passed House")

    r = await authed_client.get("/api/dashboard/activity")
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 2
    assert items[0]["timestamp"] >= items[1]["timestamp"]  # newest first
    kinds = {("vote" if it["politician"] else "action") for it in items}
    assert kinds == {"vote", "action"}


async def test_requires_auth(client):
    # client (no auth override) must be rejected.
    r = await client.get("/api/dashboard/followed")
    assert r.status_code == 401
