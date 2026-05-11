from pipeline.enrich.address_standardization import (
    parse_address,
    normalize_address,
    batch_geocode,
)


def test_parse_address_basic():
    result = parse_address("123 Main St New York NY 10001")
    assert result is not None
    assert result["street"] == "123 Main St"
    assert result["city"] == "New York"
    assert result["state"] == "NY"
    assert result["zip5"] == "10001"


def test_parse_address_partial():
    result = parse_address("New York NY 10001")
    assert result is not None
    assert result["state"] == "NY"
    assert result["zip5"] == "10001"


def test_parse_address_empty():
    result = parse_address("")
    assert result is not None
    assert result["street"] == ""


def test_normalize_address():
    row = {
        "name": "SMITH, JOHN",
        "city": "NEW YORK",
        "state": "NY",
        "zip_code": "100011234",
        "sub_id": 12345,
    }
    result = normalize_address(row)
    assert result["city"] == "NEW YORK"
    assert result["state"] == "NY"
    assert result["zip5"] == "10001"
    assert result["zip4"] == "1234"
    assert result["contribution_id"] == 12345


def test_batch_geocode_returns_empty_for_empty_input():
    results = batch_geocode([])
    assert results == []
