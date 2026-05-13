"""End-to-end tests for donor resolution flow in enrich/donor_resolution.py."""
import pytest
from unittest.mock import patch, MagicMock

from enrich.donor_resolution import (
    extract_donors_from_parquet,
    cluster_block,
    build_blocking_key,
)


# ── extract_donors_from_parquet tests ────────────────────────────────────────


class TestExtractDonorsFromParquet:
    def test_extracts_individual_donors_with_correct_fields(self, tmp_path):
        import duckdb
        parquet_path = tmp_path / "indiv.parquet"
        conn = duckdb.connect(":memory:")
        conn.execute("""
            CREATE TABLE donors AS SELECT
                'C00123456' as cmte_id, '' as amndt_ind, '' as rpt_tp,
                '' as transaction_pgi, '' as image_num, '15' as transaction_tp,
                'IND' as entity_tp, 'JOHNSON, ROBERT' as name,
                'CHICAGO' as city, 'IL' as state, '60601' as zip_code,
                'BOEING' as employer, 'ENGINEER' as occupation,
                '03152025' as transaction_dt, '1500' as transaction_amt,
                '' as other_id, '' as tran_id, '' as file_num,
                '' as memo_cd, '' as memo_text, '2001' as sub_id
        """)
        conn.execute(f"COPY donors TO '{parquet_path}' (FORMAT PARQUET)")
        conn.close()

        donors = extract_donors_from_parquet(parquet_path)
        assert len(donors) == 1
        d = donors[0]
        assert d["name"] == "JOHNSON, ROBERT"
        assert d["employer"] == "BOEING"
        assert d["city"] == "CHICAGO"
        assert d["state"] == "IL"
        assert d["zip5"] == "60601"
        assert d["cmte_id"] == "C00123456"
        assert d["amount"] == 1500.0
        assert d["sub_id"] == 2001

    def test_filters_by_entity_type(self, tmp_path):
        """Only IND and empty entity_tp should be included."""
        import duckdb
        parquet_path = tmp_path / "indiv.parquet"
        conn = duckdb.connect(":memory:")
        conn.execute("""
            CREATE TABLE donors AS
                SELECT 'C001' as cmte_id, '' as amndt_ind, '' as rpt_tp,
                    '' as transaction_pgi, '' as image_num, '15' as transaction_tp,
                    'IND' as entity_tp, 'IND DONOR' as name,
                    'NYC' as city, 'NY' as state, '10001' as zip_code,
                    'ACME' as employer, 'MGR' as occupation,
                    '01012025' as transaction_dt, '500' as transaction_amt,
                    '' as other_id, '' as tran_id, '' as file_num,
                    '' as memo_cd, '' as memo_text, '1001' as sub_id
            UNION ALL
                SELECT 'C001', '', '', '', '', '15',
                    'COM', 'PAC DONOR',
                    'NYC', 'NY', '10001',
                    'ACME', 'MGR',
                    '01012025', '500',
                    '', '', '',
                    '', '', '1002'
            UNION ALL
                SELECT 'C001', '', '', '', '', '15',
                    '', 'EMPTY ENTITY',
                    'NYC', 'NY', '10001',
                    'ACME', 'MGR',
                    '01012025', '500',
                    '', '', '',
                    '', '', '1003'
        """)
        conn.execute(f"COPY donors TO '{parquet_path}' (FORMAT PARQUET)")
        conn.close()

        donors = extract_donors_from_parquet(parquet_path)
        names = [d["name"] for d in donors]
        assert "IND DONOR" in names
        assert "EMPTY ENTITY" in names
        assert "PAC DONOR" not in names

    def test_skips_zero_amounts(self, tmp_path):
        import duckdb
        parquet_path = tmp_path / "indiv.parquet"
        conn = duckdb.connect(":memory:")
        conn.execute("""
            CREATE TABLE donors AS
                SELECT 'C001' as cmte_id, '' as amndt_ind, '' as rpt_tp,
                    '' as transaction_pgi, '' as image_num, '15' as transaction_tp,
                    'IND' as entity_tp, 'ZERO DONOR' as name,
                    'NYC' as city, 'NY' as state, '10001' as zip_code,
                    'ACME' as employer, 'MGR' as occupation,
                    '01012025' as transaction_dt, '0' as transaction_amt,
                    '' as other_id, '' as tran_id, '' as file_num,
                    '' as memo_cd, '' as memo_text, '3001' as sub_id
            UNION ALL
                SELECT 'C001', '', '', '', '', '15',
                    'IND', 'POSITIVE DONOR',
                    'NYC', 'NY', '10001',
                    'ACME', 'MGR',
                    '01012025', '100',
                    '', '', '',
                    '', '', '3002'
        """)
        conn.execute(f"COPY donors TO '{parquet_path}' (FORMAT PARQUET)")
        conn.close()

        donors = extract_donors_from_parquet(parquet_path)
        assert len(donors) == 1
        assert donors[0]["name"] == "POSITIVE DONOR"

    def test_skips_negative_amounts(self, tmp_path):
        import duckdb
        parquet_path = tmp_path / "indiv.parquet"
        conn = duckdb.connect(":memory:")
        conn.execute("""
            CREATE TABLE donors AS SELECT
                'C001' as cmte_id, '' as amndt_ind, '' as rpt_tp,
                '' as transaction_pgi, '' as image_num, '15' as transaction_tp,
                'IND' as entity_tp, 'REFUND DONOR' as name,
                'NYC' as city, 'NY' as state, '10001' as zip_code,
                'ACME' as employer, 'MGR' as occupation,
                '01012025' as transaction_dt, '-500' as transaction_amt,
                '' as other_id, '' as tran_id, '' as file_num,
                '' as memo_cd, '' as memo_text, '4001' as sub_id
        """)
        conn.execute(f"COPY donors TO '{parquet_path}' (FORMAT PARQUET)")
        conn.close()

        donors = extract_donors_from_parquet(parquet_path)
        assert len(donors) == 0


# ── cluster_block fast paths tests ───────────────────────────────────────────


class TestClusterBlock:
    def _donor(self, sub_id, name="SMITH, JOHN", employer="ACME", city="NYC", state="NY"):
        return {
            "sub_id": sub_id,
            "name": name,
            "employer": employer,
            "city": city,
            "state": state,
            "zip5": "10001",
        }

    def test_single_donor_returns_single_cluster(self):
        donors = [self._donor(1)]
        result = cluster_block(donors, model=None)
        assert result == {0: [0]}

    def test_all_same_name_employer_single_cluster_no_embedding(self):
        donors = [self._donor(i) for i in range(5)]
        result = cluster_block(donors, model=None)
        assert len(result) == 1
        assert sorted(list(result.values())[0]) == [0, 1, 2, 3, 4]

    def test_all_unique_text_le3_each_own_cluster(self):
        donors = [
            self._donor(1, "SMITH, JOHN", "ACME"),
            self._donor(2, "DOE, JANE", "GOOGLE"),
            self._donor(3, "PARK, JIN", "AMAZON"),
        ]
        result = cluster_block(donors, model=None)
        assert len(result) == 3
        for label, indices in result.items():
            assert len(indices) == 1

    def test_model_none_groups_by_exact_text(self):
        """With model=None and >3 unique texts, groups by exact text match."""
        donors = [
            self._donor(1, "SMITH, JOHN", "ACME"),
            self._donor(2, "DOE, JANE", "GOOGLE"),
            self._donor(3, "SMITH, JOHN", "ACME"),
            self._donor(4, "PARK, JIN", "AMAZON"),
        ]
        result = cluster_block(donors, model=None)
        # 3 unique texts -> 3 clusters, with SMITH+ACME having 2 members
        assert len(result) == 3
        found_pair = False
        for indices in result.values():
            if sorted(indices) == [0, 2]:
                found_pair = True
        assert found_pair

    def test_two_donors_same_text(self):
        donors = [
            self._donor(1, "CHEN, WEI", "TESLA"),
            self._donor(2, "CHEN, WEI", "TESLA"),
        ]
        result = cluster_block(donors, model=None)
        assert len(result) == 1
        assert sorted(list(result.values())[0]) == [0, 1]


# ── build_blocking_key tests ─────────────────────────────────────────────────


class TestBuildBlockingKey:
    def test_correct_format(self):
        assert build_blocking_key("SMITH", "10001") == "smi_10001"

    def test_uses_first_3_chars_lowercase(self):
        assert build_blocking_key("JOHNSON", "90210") == "joh_90210"

    def test_truncates_zip_to_5(self):
        assert build_blocking_key("SMITH", "100013456") == "smi_10001"

    def test_rejects_short_name(self):
        assert build_blocking_key("A", "10001") is None

    def test_rejects_short_zip(self):
        assert build_blocking_key("SMITH", "100") is None

    def test_returns_none_for_missing_name(self):
        assert build_blocking_key(None, "10001") is None

    def test_returns_none_for_missing_zip(self):
        assert build_blocking_key("SMITH", None) is None

    def test_returns_none_for_empty_strings(self):
        assert build_blocking_key("", "") is None

    def test_two_char_name(self):
        assert build_blocking_key("Li", "00000") == "li_00000"
