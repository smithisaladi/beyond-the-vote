"""Tests for the dashboard activity feed query module + endpoints."""
from datetime import datetime, timezone

from app.queries.activity import classify_alert


def test_classify_alert_passage_vote():
    assert classify_alert(kind="vote", question="On Passage of the Bill") is True


def test_classify_alert_motion_vote():
    assert classify_alert(kind="vote", question="On Motion to Recommit") is True


def test_classify_alert_routine_vote():
    assert classify_alert(kind="vote", question="On the Quorum Call") is False


def test_classify_alert_enacted_action():
    assert classify_alert(kind="action", action_text="Became Public Law No. 118-5") is True


def test_classify_alert_passed_action_via_status():
    assert classify_alert(kind="action", action_text="", status="Passed") is True


def test_classify_alert_routine_action():
    assert classify_alert(kind="action", action_text="Referred to the Committee on Finance.") is False


def test_classify_alert_unknown_kind():
    assert classify_alert(kind="other") is False


from tests.conftest import make_mock_result
from app.queries.activity import fetch_activity


async def test_fetch_activity_merges_sorts_trims(mock_db):
    votes = [{
        "vote_id": "h118-50", "bioguide_id": "A0001", "full_name": "Rep. Alpha",
        "position": "Yea", "vote_date": datetime(2024, 3, 10, tzinfo=timezone.utc),
        "question": "On Passage", "bill_id": "hr-1-118", "bill_title": "Test Act",
    }]
    actions = [{
        "action_id": 7, "bill_id": "hr-2-118", "acted_at": "2024-03-15",
        "action_text": "Passed House", "bill_number": "H.R. 2",
        "bill_title": "Other Act", "status": "Passed",
    }]
    # execute() is called votes-first, then actions (see fetch_activity).
    mock_db.execute.side_effect = [make_mock_result(votes), make_mock_result(actions)]

    items = await fetch_activity(mock_db, "user-1", limit=30)

    # 03-15 action sorts before 03-10 vote
    assert [it["id"] for it in items] == ["action-7", "vote-h118-50-A0001"]
    assert items[0]["politician"] is None
    assert items[0]["action"] == "Passed House"
    assert items[0]["isAlert"] is True
    assert items[0]["href"] == "/bills/hr-2-118"
    assert items[1]["politician"] == "Rep. Alpha"
    assert items[1]["action"] == "voted Yea"
    assert items[1]["subject"] == "Test Act"
    assert items[1]["isAlert"] is True


async def test_fetch_activity_trims_to_limit(mock_db):
    votes = [{
        "vote_id": f"v{i}", "bioguide_id": "A0001", "full_name": "Rep. Alpha",
        "position": "Nay", "vote_date": datetime(2024, 1, i + 1, tzinfo=timezone.utc),
        "question": "Quorum", "bill_id": None, "bill_title": None,
    } for i in range(3)]
    mock_db.execute.side_effect = [make_mock_result(votes), make_mock_result([])]

    items = await fetch_activity(mock_db, "user-1", limit=2)

    assert len(items) == 2
    assert items[0]["timestamp"] >= items[1]["timestamp"]
    assert items[0]["href"] is None  # null bill_id → no link


from tests.conftest import MockResult


async def test_get_activity_endpoint(authed_client, mock_db):
    votes = [{
        "vote_id": "h118-50", "bioguide_id": "A0001", "full_name": "Rep. Alpha",
        "position": "Yea", "vote_date": datetime(2024, 3, 10, tzinfo=timezone.utc),
        "question": "On Passage", "bill_id": "hr-1-118", "bill_title": "Test Act",
    }]
    actions = [{
        "action_id": 7, "bill_id": "hr-2-118", "acted_at": "2024-03-15",
        "action_text": "Passed House", "bill_number": "H.R. 2",
        "bill_title": "Other Act", "status": "Passed",
    }]
    last_seen = datetime(2024, 3, 1, tzinfo=timezone.utc)
    # GET runs: votes query, actions query (both inside fetch_activity), then last_seen.
    mock_db.execute.side_effect = [
        make_mock_result(votes),
        make_mock_result(actions),
        MockResult(scalar=last_seen),
    ]

    resp = await authed_client.get("/api/dashboard/activity")

    assert resp.status_code == 200
    data = resp.json()
    assert data["lastSeenAt"] == last_seen.isoformat()
    assert len(data["items"]) == 2
    assert data["items"][0]["timestamp"] >= data["items"][1]["timestamp"]


async def test_get_activity_null_last_seen(authed_client, mock_db):
    mock_db.execute.side_effect = [
        make_mock_result([]),
        make_mock_result([]),
        MockResult(scalar=None),
    ]

    resp = await authed_client.get("/api/dashboard/activity")

    assert resp.status_code == 200
    assert resp.json() == {"items": [], "lastSeenAt": None}


async def test_get_activity_requires_auth(client):
    resp = await client.get("/api/dashboard/activity")
    assert resp.status_code == 401
