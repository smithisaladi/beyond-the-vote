"""Tests for /api/bills endpoints."""
import pytest
from unittest.mock import AsyncMock, patch

from tests.conftest import make_mock_result


# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

BILL_ROW = {
    "bill_id": "hr1-118",
    "bill_number": "H.R. 1",
    "title": "Lower Energy Costs Act",
    "congress": 118,
    "introduced_date": "2023-03-30",
    "status": "Active",
    "summary": "A bill to lower energy costs.",
    "sponsor_name": "Steve Scalise",
    "sponsor_bioguide_id": "S001176",
    "sponsor_party": "Republican",
    "sponsor_state": "LA",
    "policy_area": "Energy",
    "topics": ["energy"],
    "congress_gov_url": "https://congress.gov/bill/118th/hr1",
    "last_action_text": "Passed House",
    "last_action_date": "2023-04-01",
    "total_count": 1,
    "search_vector": None,
}

VOTE_ROW = {
    "id": 1,
    "date": "2023-04-01",
    "chamber": "House",
    "question": "On Passage",
    "result": "Passed",
    "yea_total": 220,
    "nay_total": 210,
    "present_total": 0,
    "not_voting_total": 5,
    "yea_democrat": 0,
    "nay_democrat": 210,
    "yea_republican": 220,
    "nay_republican": 0,
    "yea_independent": 0,
    "nay_independent": 0,
    "member_positions": [],
    "source_url": None,
}

COSPONSOR_ROW = {
    "bioguide_id": "J000302",
    "sponsored_at": "2023-03-30",
    "withdrawn_at": None,
    "original_cosponsor": True,
    "full_name": "Jim Jordan",
    "party": "Republican",
    "state": "OH",
    "photo_url": None,
}

ACTION_ROW = {
    "acted_at": "2023-04-01",
    "text": "Passed/agreed to in House.",
    "action_code": "8000",
    "action_type": "Floor",
}


# ---------------------------------------------------------------------------
# GET /api/bills — list with pagination (no search query)
# ---------------------------------------------------------------------------

async def test_list_bills_returns_paginated(client, mock_db):
    mock_db.execute.return_value = make_mock_result([BILL_ROW])

    resp = await client.get("/api/bills")
    assert resp.status_code == 200
    body = resp.json()
    assert "bills" in body
    assert "pagination" in body
    assert body["pagination"]["limit"] == 20
    assert body["pagination"]["offset"] == 0
    assert len(body["bills"]) == 1
    assert body["bills"][0]["id"] == "hr1-118"


async def test_list_bills_respects_limit_and_offset(client, mock_db):
    mock_db.execute.return_value = make_mock_result([BILL_ROW])

    resp = await client.get("/api/bills", params={"limit": 5, "offset": 10})
    assert resp.status_code == 200
    body = resp.json()
    assert body["pagination"]["limit"] == 5
    assert body["pagination"]["offset"] == 10


async def test_list_bills_empty(client, mock_db):
    mock_db.execute.return_value = make_mock_result([])

    resp = await client.get("/api/bills")
    assert resp.status_code == 200
    body = resp.json()
    assert body["bills"] == []
    assert body["pagination"]["total"] == 0


async def test_list_bills_sort_newest(client, mock_db):
    mock_db.execute.return_value = make_mock_result([BILL_ROW])

    resp = await client.get("/api/bills", params={"sort": "newest"})
    assert resp.status_code == 200


async def test_list_bills_sort_oldest(client, mock_db):
    mock_db.execute.return_value = make_mock_result([BILL_ROW])

    resp = await client.get("/api/bills", params={"sort": "oldest"})
    assert resp.status_code == 200


async def test_list_bills_sort_invalid(client, mock_db):
    """Only 'newest' and 'oldest' are accepted."""
    resp = await client.get("/api/bills", params={"sort": "alphabetical"})
    assert resp.status_code == 422  # FastAPI validation error


# ---------------------------------------------------------------------------
# GET /api/bills — search (q param triggers hybrid search)
# ---------------------------------------------------------------------------

@patch("app.routers.bills.hybrid_bill_search")
@patch("app.routers.bills.embeddings_enabled", return_value=False)
async def test_list_bills_search(mock_model, mock_search, client, mock_db):
    mock_search.return_value = ([BILL_ROW], 1)

    resp = await client.get("/api/bills", params={"q": "energy"})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["bills"]) == 1
    assert body["pagination"]["total"] == 1
    mock_search.assert_called_once()


# ---------------------------------------------------------------------------
# GET /api/bills/{bill_id} — detail
# ---------------------------------------------------------------------------

@patch("app.routers.bills.get_bill_votes")
@patch("app.routers.bills.lookup_bill")
async def test_bill_detail_found(mock_lookup, mock_votes, client, mock_db):
    mock_lookup.return_value = BILL_ROW
    mock_votes.return_value = [VOTE_ROW]
    # Cosponsors query
    mock_db.execute.side_effect = [
        make_mock_result([COSPONSOR_ROW]),  # cosponsors
        make_mock_result([ACTION_ROW]),      # actions
    ]

    resp = await client.get("/api/bills/hr1-118")
    assert resp.status_code == 200
    body = resp.json()
    bill = body["bill"]
    assert bill["id"] == "hr1-118"
    assert bill["number"] == "H.R. 1"
    assert bill["sponsor"]["bioguideId"] == "S001176"
    assert len(bill["cosponsors"]) == 1
    assert len(bill["actions"]) == 1
    assert len(bill["votes"]) == 1
    assert bill["votes"][0]["yeas"] == 220


@patch("app.routers.bills.lookup_bill")
async def test_bill_detail_not_found(mock_lookup, client, mock_db):
    mock_lookup.return_value = None

    resp = await client.get("/api/bills/nonexistent")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/bills/by-topic
# ---------------------------------------------------------------------------

@patch("app.routers.bills.get_bills_by_topic")
async def test_bills_by_topic(mock_topic, client, mock_db):
    mock_topic.return_value = [BILL_ROW]

    resp = await client.get("/api/bills/by-topic", params={"slug": "energy"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["slug"] == "energy"
    assert body["count"] == 1
    assert len(body["bills"]) == 1


async def test_bills_by_topic_requires_slug(client, mock_db):
    """slug is a required query param."""
    resp = await client.get("/api/bills/by-topic")
    assert resp.status_code == 422
