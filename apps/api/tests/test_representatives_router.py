"""Tests for /api/representatives endpoint."""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from datetime import date

from tests.conftest import make_mock_result


# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

REP_ROW = {
    "bioguide_id": "P000197",
    "full_name": "Nancy Pelosi",
    "title": "Representative",
    "party": "Democrat",
    "state": "CA",
    "state_full": "California",
    "district": 11,
    "photo_url": "https://example.com/pelosi.jpg",
    "chamber": "House",
    "website": "https://pelosi.house.gov",
    "phone": "202-225-4965",
    "term_start": date(1987, 6, 9),
    "nominate_dim1": -0.5,
}

GEOCODIO_RESPONSE = {
    "results": [
        {
            "address_components": {"state": "CA"},
            "fields": {
                "congressional_districts": [
                    {"district_number": 11}
                ]
            },
        }
    ]
}


def _make_geocodio_mock(json_data, status_code=200):
    """Build a mock httpx.AsyncClient that returns the given geocodio response.

    We patch the httpx module inside the router so that when the router does
    ``async with httpx.AsyncClient() as client: resp = await client.get(...)``
    it gets our mock instead of making a real HTTP call. This avoids patching
    ``httpx.AsyncClient.get`` globally (which would break the test client too).
    """
    mock_response = MagicMock()
    mock_response.status_code = status_code
    mock_response.json.return_value = json_data

    mock_http_client = AsyncMock()
    mock_http_client.get.return_value = mock_response
    mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
    mock_http_client.__aexit__ = AsyncMock(return_value=False)

    mock_async_client_cls = MagicMock(return_value=mock_http_client)
    return mock_async_client_cls


# ---------------------------------------------------------------------------
# GET /api/representatives — requires address
# ---------------------------------------------------------------------------

async def test_representatives_requires_address(client, mock_db):
    resp = await client.get("/api/representatives")
    assert resp.status_code == 422


async def test_representatives_address_min_length(client, mock_db):
    """address must be at least 5 characters."""
    resp = await client.get("/api/representatives", params={"address": "abc"})
    assert resp.status_code == 422


@patch("app.routers.representatives.settings")
@patch("app.routers.representatives.httpx.AsyncClient")
async def test_representatives_success(mock_httpx_cls, mock_settings, client, mock_db):
    mock_settings.geocodio_api_key = "test-key"
    mock_httpx_cls.side_effect = [_make_geocodio_mock(GEOCODIO_RESPONSE)()]

    mock_db.execute.return_value = make_mock_result([REP_ROW])

    resp = await client.get(
        "/api/representatives",
        params={"address": "123 Main St, San Francisco, CA"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "representatives" in body
    assert len(body["representatives"]) == 1
    rep = body["representatives"][0]
    assert rep["bioguideId"] == "P000197"
    assert rep["name"] == "Nancy Pelosi"
    assert rep["party"] == "Democrat"
    assert rep["ideologyScore"] == -0.5
    assert rep["since"] == "1987"


@patch("app.routers.representatives.settings")
async def test_representatives_no_geocodio_key(mock_settings, client, mock_db):
    mock_settings.geocodio_api_key = ""

    resp = await client.get(
        "/api/representatives",
        params={"address": "123 Main St, San Francisco, CA"},
    )
    assert resp.status_code == 503
    assert "Geocoding not configured" in resp.json()["detail"]


@patch("app.routers.representatives.settings")
@patch("app.routers.representatives.httpx.AsyncClient")
async def test_representatives_geocodio_no_results(mock_httpx_cls, mock_settings, client, mock_db):
    mock_settings.geocodio_api_key = "test-key"
    mock_httpx_cls.side_effect = [_make_geocodio_mock({"results": []})()]

    resp = await client.get(
        "/api/representatives",
        params={"address": "123 Nowhere Lane, Fakeville, ZZ"},
    )
    assert resp.status_code == 200
    assert resp.json()["representatives"] == []


@patch("app.routers.representatives.settings")
@patch("app.routers.representatives.httpx.AsyncClient")
async def test_representatives_deduplicates(mock_httpx_cls, mock_settings, client, mock_db):
    """If the same bioguide_id appears twice, only one entry is returned."""
    mock_settings.geocodio_api_key = "test-key"
    mock_httpx_cls.side_effect = [_make_geocodio_mock(GEOCODIO_RESPONSE)()]

    mock_db.execute.return_value = make_mock_result([REP_ROW, REP_ROW])

    resp = await client.get(
        "/api/representatives",
        params={"address": "123 Main St, San Francisco, CA"},
    )
    assert resp.status_code == 200
    assert len(resp.json()["representatives"]) == 1
