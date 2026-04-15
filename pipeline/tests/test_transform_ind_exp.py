"""
Tests for transform.ind_exp — FEC pas2 independent expenditure records → DB rows.
"""
import pytest
from transform.ind_exp import transform_independent_expenditure


def _make_record(**overrides):
    base = {
        "cmte_id": "C00000001",
        "cand_id": "H0CA01234",
        "transaction_tp": "24E",
        "transaction_amt": "10000",
        "transaction_dt": "03152025",
        "sub_id": "5555555555",
    }
    base.update(overrides)
    return base


class TestTransformIndependentExpenditure:
    def test_24e_for_candidate(self):
        row = transform_independent_expenditure(_make_record(transaction_tp="24E"), cycle=2026)
        assert row is not None
        assert row["sup_opp"] == "S"
        assert row["transaction_tp"] == "24E"

    def test_24a_against_candidate(self):
        row = transform_independent_expenditure(_make_record(transaction_tp="24A"), cycle=2026)
        assert row is not None
        assert row["sup_opp"] == "O"
        assert row["transaction_tp"] == "24A"

    def test_invalid_transaction_type_returns_none(self):
        assert transform_independent_expenditure(_make_record(transaction_tp="24K"), cycle=2026) is None

    def test_missing_sub_id_returns_none(self):
        assert transform_independent_expenditure(_make_record(sub_id=""), cycle=2026) is None

    def test_missing_cmte_id_returns_none(self):
        assert transform_independent_expenditure(_make_record(cmte_id=""), cycle=2026) is None

    def test_invalid_transaction_amt_returns_none(self):
        assert transform_independent_expenditure(_make_record(transaction_amt="xyz"), cycle=2026) is None

    def test_valid_record_fields(self):
        row = transform_independent_expenditure(_make_record(), cycle=2026)
        assert row["sub_id"] == 5555555555
        assert row["cmte_id"] == "C00000001"
        assert row["cand_id"] == "H0CA01234"
        assert row["transaction_amt"] == 10000.0
        assert row["cycle"] == 2026
