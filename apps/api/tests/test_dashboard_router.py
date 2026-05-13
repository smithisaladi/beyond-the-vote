"""Tests for /api/dashboard endpoints — all require authentication."""
import pytest
from datetime import date

from tests.conftest import make_mock_result


# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

FOLLOWED_ROW = {
    "bioguide_id": "P000197",
    "full_name": "Nancy Pelosi",
    "title": "Representative",
    "party": "Democrat",
    "state": "CA",
    "state_full": "California",
    "district": 11,
    "photo_url": "https://example.com/pelosi.jpg",
    "bill_id": "hr1-118",
    "question": "On Passage",
    "vote_date": date(2024, 1, 15),
    "position": "Yea",
    "bill_title": "Lower Energy Costs Act",
}

TRACKED_BILL_ROW = {
    "bill_id": "hr1-118",
    "bill_number": "H.R. 1",
    "title": "Lower Energy Costs Act",
    "status": "Active",
    "last_action_date": date(2024, 1, 15),
    "last_action_text": "Passed House",
    "policy_area": "Energy",
}


# ---------------------------------------------------------------------------
# Auth required — 401 without token
# ---------------------------------------------------------------------------

async def test_followed_requires_auth(client, mock_db):
    resp = await client.get("/api/dashboard/followed")
    assert resp.status_code == 401


async def test_tracked_bills_requires_auth(client, mock_db):
    resp = await client.get("/api/dashboard/tracked-bills")
    assert resp.status_code == 401


async def test_follow_requires_auth(client, mock_db):
    resp = await client.post("/api/dashboard/follow/P000197")
    assert resp.status_code == 401


async def test_unfollow_requires_auth(client, mock_db):
    resp = await client.delete("/api/dashboard/follow/P000197")
    assert resp.status_code == 401


async def test_track_requires_auth(client, mock_db):
    resp = await client.post("/api/dashboard/track/hr1-118")
    assert resp.status_code == 401


async def test_untrack_requires_auth(client, mock_db):
    resp = await client.delete("/api/dashboard/track/hr1-118")
    assert resp.status_code == 401


async def test_topic_preferences_requires_auth(client, mock_db):
    resp = await client.get("/api/dashboard/topic-preferences")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/dashboard/followed — with auth
# ---------------------------------------------------------------------------

async def test_get_followed_returns_politicians(authed_client, mock_db):
    mock_db.execute.return_value = make_mock_result([FOLLOWED_ROW])

    resp = await authed_client.get("/api/dashboard/followed")
    assert resp.status_code == 200
    body = resp.json()
    assert "politicians" in body
    assert len(body["politicians"]) == 1
    pol = body["politicians"][0]
    assert pol["id"] == "P000197"
    assert pol["name"] == "Nancy Pelosi"
    assert pol["latestVote"] is not None
    assert pol["latestVote"]["billId"] == "hr1-118"
    assert pol["latestVote"]["vote"] == "Yea"


async def test_get_followed_empty(authed_client, mock_db):
    mock_db.execute.return_value = make_mock_result([])

    resp = await authed_client.get("/api/dashboard/followed")
    assert resp.status_code == 200
    assert resp.json()["politicians"] == []


async def test_get_followed_no_latest_vote(authed_client, mock_db):
    row = dict(FOLLOWED_ROW)
    row["vote_date"] = None
    row["bill_id"] = None
    row["position"] = None
    row["question"] = None
    row["bill_title"] = None
    mock_db.execute.return_value = make_mock_result([row])

    resp = await authed_client.get("/api/dashboard/followed")
    assert resp.status_code == 200
    pol = resp.json()["politicians"][0]
    assert pol["latestVote"] is None


# ---------------------------------------------------------------------------
# GET /api/dashboard/tracked-bills — with auth
# ---------------------------------------------------------------------------

async def test_get_tracked_bills(authed_client, mock_db):
    mock_db.execute.return_value = make_mock_result([TRACKED_BILL_ROW])

    resp = await authed_client.get("/api/dashboard/tracked-bills")
    assert resp.status_code == 200
    body = resp.json()
    assert "bills" in body
    assert len(body["bills"]) == 1
    bill = body["bills"][0]
    assert bill["id"] == "hr1-118"
    assert bill["title"] == "Lower Energy Costs Act"
    assert bill["status"] == "Active"


async def test_get_tracked_bills_empty(authed_client, mock_db):
    mock_db.execute.return_value = make_mock_result([])

    resp = await authed_client.get("/api/dashboard/tracked-bills")
    assert resp.status_code == 200
    assert resp.json()["bills"] == []


# ---------------------------------------------------------------------------
# POST/DELETE follow/track — with auth
# ---------------------------------------------------------------------------

async def test_follow_politician(authed_client, mock_db):
    mock_db.execute.return_value = make_mock_result([])

    resp = await authed_client.post("/api/dashboard/follow/P000197")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


async def test_unfollow_politician(authed_client, mock_db):
    mock_db.execute.return_value = make_mock_result([])

    resp = await authed_client.delete("/api/dashboard/follow/P000197")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


async def test_track_bill(authed_client, mock_db):
    mock_db.execute.return_value = make_mock_result([])

    resp = await authed_client.post("/api/dashboard/track/hr1-118")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


async def test_untrack_bill(authed_client, mock_db):
    mock_db.execute.return_value = make_mock_result([])

    resp = await authed_client.delete("/api/dashboard/track/hr1-118")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
