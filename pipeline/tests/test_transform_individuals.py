"""
Tests for transform.individuals — FEC individual contribution records → DB rows.
"""
import pytest
from transform.individuals import transform_individual


def _make_record(**overrides):
    base = {
        "cmte_id": "C00000001",
        "name": "DOE, JOHN",
        "city": "LOS ANGELES",
        "state": "CA",
        "zip_code": "900121234",
        "employer": "ACME INC",
        "occupation": "ENGINEER",
        "transaction_dt": "01152025",
        "transaction_amt": "250",
        "sub_id": "9876543210",
    }
    base.update(overrides)
    return base


class TestTransformIndividual:
    def test_valid_record(self):
        row = transform_individual(_make_record(), cycle=2026, valid_cmte_ids=set())
        assert row is not None
        assert row["sub_id"] == 9876543210
        assert row["cmte_id"] == "C00000001"
        assert row["name"] == "DOE, JOHN"
        assert row["transaction_amt"] == 250.0
        assert row["cycle"] == 2026

    def test_cmte_id_filtering_excluded(self):
        valid = {"C00000099"}
        row = transform_individual(_make_record(), cycle=2026, valid_cmte_ids=valid)
        assert row is None

    def test_cmte_id_filtering_included(self):
        valid = {"C00000001"}
        row = transform_individual(_make_record(), cycle=2026, valid_cmte_ids=valid)
        assert row is not None

    def test_empty_valid_cmte_ids_passes_all(self):
        row = transform_individual(_make_record(), cycle=2026, valid_cmte_ids=set())
        assert row is not None

    def test_missing_cmte_id_returns_none(self):
        assert transform_individual(_make_record(cmte_id=""), cycle=2026, valid_cmte_ids=set()) is None

    def test_missing_sub_id_returns_none(self):
        assert transform_individual(_make_record(sub_id=""), cycle=2026, valid_cmte_ids=set()) is None

    def test_zip_code_truncated_to_9(self):
        row = transform_individual(
            _make_record(zip_code="9001212345678"), cycle=2026, valid_cmte_ids=set()
        )
        assert row is not None
        assert len(row["zip_code"]) == 9

    def test_invalid_transaction_amt_returns_none(self):
        assert transform_individual(
            _make_record(transaction_amt="notanumber"), cycle=2026, valid_cmte_ids=set()
        ) is None
