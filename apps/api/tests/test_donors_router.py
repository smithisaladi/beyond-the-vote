"""Tests for /api/donors endpoints."""
import pytest
from unittest.mock import AsyncMock, patch

from tests.conftest import make_mock_result, make_scalar_result


# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

LEADERBOARD_ROW = {
    "cmte_id": "C00123456",
    "cmte_name": "Test PAC",
    "direct_total": 100000,
    "ie_for_total": 50000,
    "ie_against_total": 10000,
    "total_contributions": 160000,
    "global_rank": 1,
    "total_count": 1,
}

PAC_DETAIL = {
    "cmteId": "C00123456",
    "name": "Test PAC",
    "connectedOrg": "Test Corp",
    "directTotal": 100000,
    "ieForTotal": 50000,
    "ieAgainstTotal": 10000,
    "totalContributions": 160000,
    "recipientCount": 2,
    "recipients": [
        {"bioguideId": "P000197", "name": "Nancy Pelosi", "party": "Democrat",
         "state": "CA", "chamber": "House", "direct": 50000, "ieFor": 25000,
         "ieAgainst": 5000, "amount": 75000},
    ],
}

FUNDER_ROW = {
    "canonical_donor_id": "donor-1",
    "display_name": "John Smith",
    "employer": "Acme Corp",
    "state": "CA",
    "total_amount": 50000.0,
    "contribution_count": 5,
    "confidence": 0.95,
    "rank": 1,
}

RECIPIENT_ROW = {
    "entity_id": "H0CA11001",
    "name": "Nancy Pelosi",
    "party": "Democrat",
    "state": "CA",
    "chamber": "House",
    "bioguide_id": "P000197",
    "cand_office": "H",
    "direct": 50000.0,
    "ie_for": 10000.0,
    "ie_against": 2000.0,
    "amount": 62000.0,
}

FLOW_STATS_ROW = {
    "total_inbound": 500000,
    "total_outbound": 300000,
    "funder_count": 10,
    "recipient_count": 25,
}


# ---------------------------------------------------------------------------
# GET /api/donors — list
# ---------------------------------------------------------------------------

@patch("app.routers.donors.pac_leaderboard")
async def test_list_donors(mock_leaderboard, client, mock_db):
    mock_leaderboard.return_value = ([LEADERBOARD_ROW], 1)

    resp = await client.get("/api/donors")
    assert resp.status_code == 200
    body = resp.json()
    assert "contributors" in body
    assert "pagination" in body
    assert body["pagination"]["total"] == 1
    assert len(body["contributors"]) == 1
    assert body["contributors"][0]["cmteId"] == "C00123456"


@patch("app.routers.donors.pac_leaderboard")
async def test_list_donors_pagination(mock_leaderboard, client, mock_db):
    mock_leaderboard.return_value = ([], 0)

    resp = await client.get("/api/donors", params={"limit": 10, "offset": 5})
    assert resp.status_code == 200
    body = resp.json()
    assert body["pagination"]["limit"] == 10
    assert body["pagination"]["offset"] == 5


@patch("app.routers.donors.pac_leaderboard")
async def test_list_donors_with_search(mock_leaderboard, client, mock_db):
    mock_leaderboard.return_value = ([LEADERBOARD_ROW], 1)

    resp = await client.get("/api/donors", params={"q": "Test"})
    assert resp.status_code == 200
    mock_leaderboard.assert_called_once()
    call_kwargs = mock_leaderboard.call_args
    assert call_kwargs[1]["q"] == "Test"


# ---------------------------------------------------------------------------
# GET /api/donors/{cmte_id} — detail
# ---------------------------------------------------------------------------

@patch("app.routers.donors._get_cached_summary", return_value=None)
@patch("app.routers.donors.pac_detail")
async def test_donor_detail_found(mock_detail, mock_summary, client, mock_db):
    mock_detail.return_value = dict(PAC_DETAIL)

    resp = await client.get("/api/donors/C00123456")
    assert resp.status_code == 200
    body = resp.json()
    assert body["cmteId"] == "C00123456"
    assert body["name"] == "Test PAC"


@patch("app.routers.donors.pac_detail")
async def test_donor_detail_not_found(mock_detail, client, mock_db):
    mock_detail.return_value = None

    resp = await client.get("/api/donors/NONEXISTENT")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/donors/{cmte_id}/money-flow
# ---------------------------------------------------------------------------

async def test_money_flow_found(client, mock_db):
    mock_db.execute.side_effect = [
        make_scalar_result("Test PAC"),          # cmte_name lookup
        make_mock_result([FUNDER_ROW]),           # pac_top_funders
        make_mock_result([RECIPIENT_ROW]),        # recipients
        make_mock_result([FLOW_STATS_ROW]),       # flow stats
    ]

    resp = await client.get("/api/donors/C00123456/money-flow")
    assert resp.status_code == 200
    body = resp.json()
    assert body["cmteId"] == "C00123456"
    assert body["cmteName"] == "Test PAC"
    assert len(body["topFunders"]) == 1
    assert len(body["topRecipients"]) == 1
    assert "flowStats" in body
    assert body["flowStats"]["totalInbound"] == 500000


async def test_money_flow_not_found(client, mock_db):
    mock_db.execute.return_value = make_scalar_result(None)

    resp = await client.get("/api/donors/NONEXISTENT/money-flow")
    assert resp.status_code == 404


async def test_money_flow_no_individual_funders_falls_back(client, mock_db):
    """When no individual funders exist, falls back to PAC source funders."""
    mock_db.execute.side_effect = [
        make_scalar_result("Test PAC"),          # cmte_name
        make_mock_result([]),                    # no individual funders
        make_mock_result([{                      # PAC source fallback
            "origin_entity_id": "C00999999",
            "name": "Upstream PAC",
            "total_amount": 25000.0,
            "flow_count": 3,
        }]),
        make_mock_result([RECIPIENT_ROW]),       # recipients
        make_mock_result([FLOW_STATS_ROW]),      # flow stats
    ]

    resp = await client.get("/api/donors/C00123456/money-flow")
    assert resp.status_code == 200
    body = resp.json()
    assert body["funderType"] == "pac"
    assert len(body["topFunders"]) == 1
    assert body["topFunders"][0]["type"] == "pac"


# ---------------------------------------------------------------------------
# POST /api/donors/{cmte_id}/summary — requires auth
# ---------------------------------------------------------------------------

async def test_pac_summary_requires_auth(client, mock_db):
    """POST without auth returns 401."""
    resp = await client.post("/api/donors/C00123456/summary")
    assert resp.status_code == 401


@patch("app.routers.donors._get_cached_summary", return_value="Cached summary text.")
async def test_pac_summary_returns_cached(mock_cache, authed_client, mock_db):
    resp = await authed_client.post("/api/donors/C00123456/summary")
    assert resp.status_code == 200
    body = resp.json()
    assert body["summary"] == "Cached summary text."
