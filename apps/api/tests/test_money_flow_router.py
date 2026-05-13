"""Tests for /api/money-flow/{entity_id} endpoint."""
import pytest

from tests.conftest import make_mock_result


# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

INBOUND_ROW = {
    "origin_entity_id": "C00999999",
    "origin_entity_type": "pac",
    "attributed_amount": 50000.0,
    "hop_count": 1,
    "path": [],
    "cycle": 2024,
    "origin_name": "Upstream PAC",
}

OUTBOUND_ROW = {
    "destination_committee_id": "C00888888",
    "origin_entity_type": "pac",
    "attributed_amount": 30000.0,
    "hop_count": 1,
    "path": [],
    "cycle": 2024,
    "dest_name": "Downstream PAC",
}

ENTITY_NAME_ROW = {
    "cmte_name": "Test Entity PAC",
}


# ---------------------------------------------------------------------------
# GET /api/money-flow/{entity_id} — inbound
# ---------------------------------------------------------------------------

async def test_money_flow_inbound(client, mock_db):
    mock_db.execute.side_effect = [
        make_mock_result([INBOUND_ROW]),       # flow query
        make_mock_result([ENTITY_NAME_ROW]),   # entity name lookup
    ]

    resp = await client.get("/api/money-flow/C00123456", params={"direction": "inbound"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["entityId"] == "C00123456"
    assert body["direction"] == "inbound"
    assert len(body["edges"]) == 1
    assert body["edges"][0]["from"] == "C00999999"
    assert body["edges"][0]["to"] == "C00123456"
    assert body["totalFlow"] > 0


# ---------------------------------------------------------------------------
# GET /api/money-flow/{entity_id} — outbound
# ---------------------------------------------------------------------------

async def test_money_flow_outbound(client, mock_db):
    mock_db.execute.side_effect = [
        make_mock_result([OUTBOUND_ROW]),      # flow query
        make_mock_result([ENTITY_NAME_ROW]),   # entity name lookup
    ]

    resp = await client.get("/api/money-flow/C00123456", params={"direction": "outbound"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["direction"] == "outbound"
    assert len(body["edges"]) == 1
    assert body["edges"][0]["from"] == "C00123456"
    assert body["edges"][0]["to"] == "C00888888"


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

async def test_money_flow_invalid_direction(client, mock_db):
    resp = await client.get("/api/money-flow/C00123456", params={"direction": "sideways"})
    assert resp.status_code == 400
    assert "direction" in resp.json()["detail"].lower()


async def test_money_flow_depth_too_low(client, mock_db):
    """depth must be >= 1."""
    resp = await client.get("/api/money-flow/C00123456", params={"depth": 0})
    assert resp.status_code == 422


async def test_money_flow_depth_too_high(client, mock_db):
    """depth must be <= 5."""
    resp = await client.get("/api/money-flow/C00123456", params={"depth": 10})
    assert resp.status_code == 422


async def test_money_flow_default_depth(client, mock_db):
    """Default depth is 3, direction is inbound."""
    mock_db.execute.side_effect = [
        make_mock_result([INBOUND_ROW]),
        make_mock_result([ENTITY_NAME_ROW]),
    ]

    resp = await client.get("/api/money-flow/C00123456")
    assert resp.status_code == 200
    body = resp.json()
    assert body["direction"] == "inbound"


# ---------------------------------------------------------------------------
# 404 — entity not found
# ---------------------------------------------------------------------------

async def test_money_flow_entity_not_found(client, mock_db):
    """When no flow rows AND no entity name, return 404."""
    mock_db.execute.side_effect = [
        make_mock_result([]),   # no flow rows
        make_mock_result([]),   # no entity name
    ]

    resp = await client.get("/api/money-flow/NONEXISTENT")
    assert resp.status_code == 404


async def test_money_flow_no_data_but_entity_exists(client, mock_db):
    """When no flow rows but entity name exists, return 200 with empty flows."""
    mock_db.execute.side_effect = [
        make_mock_result([]),                  # no flow rows
        make_mock_result([ENTITY_NAME_ROW]),   # entity exists
    ]

    resp = await client.get("/api/money-flow/C00123456")
    assert resp.status_code == 200
    body = resp.json()
    assert body["flows"] == []
    assert "message" in body
