"""
Tests for transform.legislators — YAML record → DB row transformation.
"""
import pytest
from transform.legislators import transform_legislator, PARTY_MAP, CHAMBER_MAP


def _make_record(**overrides):
    base = {
        "id": {"bioguide": "S000001", "fec": ["H0CA01234"], "govtrack": 412345},
        "name": {"official_full": "Jane Smith", "first": "Jane", "last": "Smith"},
        "bio": {"birthday": "1970-01-01", "gender": "F"},
        "terms": [{
            "type": "sen",
            "start": "2019-01-03",
            "end": "2025-01-03",
            "state": "CA",
            "party": "Democrat",
            "url": "https://smith.senate.gov",
        }],
        "social": {"twitter": "JaneSmith"},
    }
    base.update(overrides)
    return base


class TestTransformLegislator:
    def test_basic_transform(self):
        row = transform_legislator(_make_record(), in_office=True)
        assert row is not None
        assert row["bioguide_id"] == "S000001"
        assert row["full_name"] == "Jane Smith"
        assert row["party"] == "Democrat"
        assert row["chamber"] == "Senate"
        assert row["state"] == "CA"
        assert row["in_office"] is True

    def test_returns_none_for_missing_bioguide(self):
        record = _make_record()
        record["id"] = {}
        assert transform_legislator(record, in_office=True) is None

    def test_returns_none_for_no_terms(self):
        record = _make_record(terms=[])
        assert transform_legislator(record, in_office=True) is None

    def test_party_normalization(self):
        for raw, expected in PARTY_MAP.items():
            record = _make_record()
            record["terms"][-1]["party"] = raw
            row = transform_legislator(record, in_office=True)
            assert row["party"] == expected

    def test_chamber_mapping(self):
        for term_type, expected in CHAMBER_MAP.items():
            record = _make_record()
            record["terms"][-1]["type"] = term_type
            row = transform_legislator(record, in_office=True)
            assert row["chamber"] == expected

    def test_fec_ids_array(self):
        row = transform_legislator(_make_record(), in_office=True)
        assert isinstance(row["fec_ids"], list)
        assert "H0CA01234" in row["fec_ids"]

    def test_fallback_full_name(self):
        """When official_full is missing, constructs from first + last."""
        record = _make_record()
        record["name"] = {"first": "Jane", "last": "Smith"}
        row = transform_legislator(record, in_office=True)
        assert row["full_name"] == "Jane Smith"
