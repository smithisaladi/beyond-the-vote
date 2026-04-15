"""
Tests for transform.pac_to_cand — FEC pas2 records → pac_to_candidate DB rows.
"""
import pytest
from transform.pac_to_cand import transform_pac_contribution


def _make_record(**overrides):
    base = {
        "cmte_id": "C00000001",
        "cand_id": "H0CA01234",
        "transaction_tp": "24K",
        "transaction_amt": "5000",
        "transaction_dt": "01152025",
        "sub_id": "1234567890",
    }
    base.update(overrides)
    return base


class TestTransformPacContribution:
    def test_valid_24k_record(self):
        row = transform_pac_contribution(_make_record(), cycle=2026)
        assert row is not None
        assert row["sub_id"] == 1234567890
        assert row["cmte_id"] == "C00000001"
        assert row["cand_id"] == "H0CA01234"
        assert row["transaction_tp"] == "24K"
        assert row["transaction_amt"] == 5000.0
        assert row["cycle"] == 2026

    def test_valid_24z_record(self):
        row = transform_pac_contribution(_make_record(transaction_tp="24Z"), cycle=2026)
        assert row is not None
        assert row["transaction_tp"] == "24Z"

    def test_missing_sub_id_returns_none(self):
        assert transform_pac_contribution(_make_record(sub_id=""), cycle=2026) is None

    def test_missing_cmte_id_returns_none(self):
        assert transform_pac_contribution(_make_record(cmte_id=""), cycle=2026) is None

    def test_invalid_transaction_amt_returns_none(self):
        assert transform_pac_contribution(_make_record(transaction_amt="abc"), cycle=2026) is None

    def test_invalid_transaction_type_returns_none(self):
        assert transform_pac_contribution(_make_record(transaction_tp="15"), cycle=2026) is None

    def test_empty_cand_id_becomes_none(self):
        row = transform_pac_contribution(_make_record(cand_id=""), cycle=2026)
        assert row is not None
        assert row["cand_id"] is None
