"""Tests for /api/politicians endpoints."""
import pytest
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch
from datetime import date

from tests.conftest import make_mock_result


# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

SEARCH_ROW = {
    "bioguide_id": "P000197",
    "full_name": "Nancy Pelosi",
    "title": "Representative",
    "party": "Democrat",
    "state": "CA",
    "state_full": "California",
    "district": 11,
    "photo_url": "https://example.com/pelosi.jpg",
    "chamber": "House",
    "term_start": date(2023, 1, 3),
    "nominate_dim1": -0.5,
}

PROFILE_ROW = {
    "bioguide_id": "P000197",
    "full_name": "Nancy Pelosi",
    "title": "Representative",
    "party": "Democrat",
    "state": "CA",
    "state_full": "California",
    "district": 11,
    "photo_url": "https://example.com/pelosi.jpg",
    "chamber": "House",
    "term_start": date(1987, 6, 9),
    "website": "https://pelosi.house.gov",
    "address": "2371 Rayburn",
    "phone": "202-225-4965",
    "twitter": "SpeakerPelosi",
    "next_election": "2024",
    "in_office": True,
}

IDEOLOGY_ROW = {
    "nominate_dim1": -0.5,
    "congress": 118,
}

COMMITTEE_ROW = {
    "name": "Appropriations",
    "url": "https://example.com",
    "chamber": "House",
    "role": "Member",
}

VOTE_ROW = {
    "id": 1,
    "date": date(2024, 1, 15),
    "chamber": "House",
    "question": "On Passage",
    "result": "Passed",
    "yea_total": 220,
    "nay_total": 200,
    "bill_id": "hr1-118",
    "position": "Yea",
    "bill_title": "Test Bill",
}

BILL_ROW = {
    "bill_id": "hr100-118",
    "bill_number": "H.R. 100",
    "title": "Pelosi Bill",
    "status": "Active",
    "introduced_date": date(2023, 5, 1),
    "last_action_date": date(2023, 6, 1),
    "last_action_text": "Introduced",
    "policy_area": "Government",
    "topics": ["government"],
}

FUNDING_ROW = {
    "pac_direct_total": 500000,
    "large_donor_total": 300000,
    "small_donor_total": 200000,
    "superpac_ie_for": 100000,
    "superpac_ie_against": 50000,
    "in_state_total": 400000,
    "out_of_state_total": 100000,
    "cycle": 2024,
}

PAC_ROW = {
    "cmte_id": "C00123456",
    "cmte_name": "Test PAC",
    "direct_contribution": 50000.0,
    "ie_for": 10000.0,
    "total_support": 60000.0,
}

CONTRIBUTOR_ROW = {
    "rank": 1,
    "org_name": "Google LLC",
    "cmte_id": "C00123456",
    "direct": 25000.0,
    "ie_for": 5000.0,
    "total": 30000.0,
}


# ---------------------------------------------------------------------------
# GET /api/politicians/search
# ---------------------------------------------------------------------------

async def test_search_politicians(client, mock_db):
    mock_db.execute.return_value = make_mock_result([SEARCH_ROW])

    resp = await client.get("/api/politicians/search", params={"q": "Pelosi"})
    assert resp.status_code == 200
    body = resp.json()
    assert "politicians" in body
    assert len(body["politicians"]) == 1
    pol = body["politicians"][0]
    assert pol["bioguideId"] == "P000197"
    assert pol["name"] == "Nancy Pelosi"
    assert pol["party"] == "Democrat"
    assert pol["ideologyScore"] == -0.5


async def test_search_politicians_deduplicates(client, mock_db):
    """If the same bioguide_id appears twice, only one entry is returned."""
    mock_db.execute.return_value = make_mock_result([SEARCH_ROW, SEARCH_ROW])

    resp = await client.get("/api/politicians/search", params={"q": "Pelosi"})
    assert resp.status_code == 200
    assert len(resp.json()["politicians"]) == 1


async def test_search_requires_q(client, mock_db):
    """q is required."""
    resp = await client.get("/api/politicians/search")
    assert resp.status_code == 422


async def test_search_q_min_length(client, mock_db):
    """q must be at least 2 characters."""
    resp = await client.get("/api/politicians/search", params={"q": "a"})
    assert resp.status_code == 422


async def test_search_empty_results(client, mock_db):
    mock_db.execute.return_value = make_mock_result([])

    resp = await client.get("/api/politicians/search", params={"q": "zzzzz"})
    assert resp.status_code == 200
    assert resp.json()["politicians"] == []


# ---------------------------------------------------------------------------
# GET /api/politicians/{bioguide_id} — detail
# ---------------------------------------------------------------------------

def _mock_factory(mock_db):
    """Create a session factory that yields the shared mock_db."""
    @asynccontextmanager
    async def _session():
        yield mock_db
    return _session


async def test_politician_detail_found(client, mock_db):
    """Detail endpoint returns profile with all sub-fields."""
    # Profile uses the DI-injected db; the 7 gathered subqueries each
    # get their own session from _get_session_factory, so we patch it
    # to return the same mock_db.
    mock_db.execute.side_effect = [
        make_mock_result([PROFILE_ROW]),     # profile (DI session)
        make_mock_result([IDEOLOGY_ROW]),     # ideology
        make_mock_result([COMMITTEE_ROW]),    # committees
        make_mock_result([VOTE_ROW]),         # votes
        make_mock_result([BILL_ROW]),         # bills
        make_mock_result([FUNDING_ROW]),      # funding
        make_mock_result([PAC_ROW]),          # top_pacs
        make_mock_result([CONTRIBUTOR_ROW]),  # top_contributors
    ]

    with patch("app.routers.politicians._get_session_factory", return_value=_mock_factory(mock_db)):
        resp = await client.get("/api/politicians/P000197")
    assert resp.status_code == 200
    body = resp.json()
    pol = body["politician"]

    assert pol["bioguideId"] == "P000197"
    assert pol["name"] == "Nancy Pelosi"
    assert pol["party"] == "Democrat"
    assert pol["state"] == "California"
    assert pol["title"] == "U.S. Representative"

    # Stats
    assert pol["stats"]["ideologyScore"] == -0.5
    assert pol["stats"]["ideologyLabel"] == "Liberal"

    # Sub-fields present
    assert isinstance(pol["votes"], list)
    assert isinstance(pol["bills"], list)
    assert isinstance(pol["committees"], list)
    assert isinstance(pol["pacDonors"], list)
    assert isinstance(pol["topContributors"], list)
    assert isinstance(pol["fundingBreakdown"], dict)


async def test_politician_detail_not_found(client, mock_db):
    mock_db.execute.return_value = make_mock_result([])

    resp = await client.get("/api/politicians/UNKNOWN")
    assert resp.status_code == 404


async def test_politician_detail_no_ideology(client, mock_db):
    """When ideology data is missing, score and label should be None."""
    mock_db.execute.side_effect = [
        make_mock_result([PROFILE_ROW]),     # profile
        make_mock_result([]),                # ideology (empty)
        make_mock_result([]),                # committees
        make_mock_result([]),                # votes
        make_mock_result([]),                # bills
        make_mock_result([]),                # funding
        make_mock_result([]),                # top_pacs
        make_mock_result([]),                # top_contributors
    ]

    with patch("app.routers.politicians._get_session_factory", return_value=_mock_factory(mock_db)):
        resp = await client.get("/api/politicians/P000197")
    assert resp.status_code == 200
    stats = resp.json()["politician"]["stats"]
    assert stats["ideologyScore"] is None
    assert stats["ideologyLabel"] is None


async def test_politician_detail_funding_breakdown(client, mock_db):
    """Funding breakdown includes correct totals and percentages."""
    mock_db.execute.side_effect = [
        make_mock_result([PROFILE_ROW]),
        make_mock_result([IDEOLOGY_ROW]),
        make_mock_result([]),
        make_mock_result([]),
        make_mock_result([]),
        make_mock_result([FUNDING_ROW]),
        make_mock_result([]),
        make_mock_result([]),
    ]

    with patch("app.routers.politicians._get_session_factory", return_value=_mock_factory(mock_db)):
        resp = await client.get("/api/politicians/P000197")
    funding = resp.json()["politician"]["fundingBreakdown"]
    assert funding["pac"] == 500000
    assert funding["total"] == 1000000  # 500k + 300k + 200k
    assert funding["cycle"] == 2024
    assert funding["superPacFor"] == 100000
