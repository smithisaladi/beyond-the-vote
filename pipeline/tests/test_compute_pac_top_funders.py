"""Tests for scripts/compute_pac_top_funders.py."""
import pytest
from unittest.mock import patch, MagicMock, call
from pathlib import Path

import pandas as pd


class TestComputeForCycle:
    """Test compute_for_cycle with mocked DB and DuckDB."""

    @pytest.fixture
    def mock_db(self):
        """Set up mocked DB connection and cursor."""
        with patch("scripts.compute_pac_top_funders.get_conn") as mock_get_conn, \
             patch("scripts.compute_pac_top_funders.reset_conn") as mock_reset_conn:
            mock_conn = MagicMock()
            mock_cursor = MagicMock()
            mock_conn.cursor.return_value = mock_cursor
            mock_get_conn.return_value = mock_conn
            yield {
                "get_conn": mock_get_conn,
                "conn": mock_conn,
                "cursor": mock_cursor,
                "reset_conn": mock_reset_conn,
            }

    @pytest.fixture
    def mock_duckdb(self):
        """Set up mocked DuckDB context manager."""
        with patch("scripts.compute_pac_top_funders.duckdb_connect") as mock_duck:
            mock_duck_conn = MagicMock()
            mock_duck.return_value.__enter__ = MagicMock(return_value=mock_duck_conn)
            mock_duck.return_value.__exit__ = MagicMock(return_value=False)
            yield mock_duck_conn

    def test_loads_canonical_donors_and_matches(self, mock_db, mock_duckdb, tmp_path):
        """Full flow: loads canonical donors, matches contributions, ranks top N."""
        from scripts.compute_pac_top_funders import compute_for_cycle

        # Create a fake parquet file so the exists() check passes
        data_dir = tmp_path / "data" / "fec" / "2024"
        data_dir.mkdir(parents=True)
        parquet_file = data_dir / "indiv.parquet"
        parquet_file.touch()

        # First cursor.fetchall: canonical donor info
        # Second cursor.fetchall: canonical name-employer index
        canonical_info = [
            ("d_100", "SMITH, JOHN", "GOLDMAN SACHS", "NY", 0.85),
            ("d_200", "DOE, JANE", "GOOGLE", "CA", 0.90),
        ]
        name_emp_index = [
            ("d_100", "SMITH, JOHN", "GOLDMAN SACHS"),
            ("d_200", "DOE, JANE", "GOOGLE"),
        ]
        mock_db["cursor"].fetchall.side_effect = [canonical_info, name_emp_index]

        # DuckDB returns contribution aggregates
        contrib_df = pd.DataFrame({
            "name_lower": ["smith, john", "doe, jane", "smith, john"],
            "employer_lower": ["goldman sachs", "google", "goldman sachs"],
            "zip5": ["10001", "94105", "10001"],
            "cmte_id": ["C001", "C001", "C002"],
            "total_amt": [5000.0, 3000.0, 1000.0],
            "cnt": [2, 1, 1],
        })
        mock_duckdb.execute.return_value.fetchdf.return_value = contrib_df

        with patch("scripts.compute_pac_top_funders.DATA_DIR", tmp_path / "data"), \
             patch("shared.db.upsert") as mock_upsert:
            result = compute_for_cycle(2024, top_n=10)

        # d_100 gave $5000 to C001 and $1000 to C002; d_200 gave $3000 to C001
        # All above $200 threshold
        assert result == 3  # 3 pac-donor rows

    def test_filters_by_200_threshold(self, mock_db, mock_duckdb, tmp_path):
        """Contributions below $200 per PAC are excluded."""
        from scripts.compute_pac_top_funders import compute_for_cycle

        data_dir = tmp_path / "data" / "fec" / "2024"
        data_dir.mkdir(parents=True)
        (data_dir / "indiv.parquet").touch()

        canonical_info = [("d_100", "SMITH, JOHN", "ACME", "NY", 0.85)]
        name_emp_index = [("d_100", "SMITH, JOHN", "ACME")]
        mock_db["cursor"].fetchall.side_effect = [canonical_info, name_emp_index]

        # Only $150 contribution -- below $200 threshold
        contrib_df = pd.DataFrame({
            "name_lower": ["smith, john"],
            "employer_lower": ["acme"],
            "zip5": ["10001"],
            "cmte_id": ["C001"],
            "total_amt": [150.0],
            "cnt": [1],
        })
        mock_duckdb.execute.return_value.fetchdf.return_value = contrib_df

        with patch("scripts.compute_pac_top_funders.DATA_DIR", tmp_path / "data"), \
             patch("shared.db.upsert") as mock_upsert:
            result = compute_for_cycle(2024, top_n=10)

        assert result == 0
        mock_upsert.assert_not_called()

    def test_ranks_top_n_per_pac(self, mock_db, mock_duckdb, tmp_path):
        """Only top N donors per PAC are returned."""
        from scripts.compute_pac_top_funders import compute_for_cycle

        data_dir = tmp_path / "data" / "fec" / "2024"
        data_dir.mkdir(parents=True)
        (data_dir / "indiv.parquet").touch()

        # Create 5 canonical donors
        canonical_info = [
            (f"d_{i}", f"DONOR{i}, NAME", f"EMPLOYER{i}", "NY", 0.85)
            for i in range(5)
        ]
        name_emp_index = [
            (f"d_{i}", f"DONOR{i}, NAME", f"EMPLOYER{i}")
            for i in range(5)
        ]
        mock_db["cursor"].fetchall.side_effect = [canonical_info, name_emp_index]

        # All 5 donors give to PAC C001 with amounts 5000, 4000, 3000, 2000, 1000
        contrib_df = pd.DataFrame({
            "name_lower": [f"donor{i}, name" for i in range(5)],
            "employer_lower": [f"employer{i}" for i in range(5)],
            "zip5": ["10001"] * 5,
            "cmte_id": ["C001"] * 5,
            "total_amt": [5000.0, 4000.0, 3000.0, 2000.0, 1000.0],
            "cnt": [1] * 5,
        })
        mock_duckdb.execute.return_value.fetchdf.return_value = contrib_df

        with patch("scripts.compute_pac_top_funders.DATA_DIR", tmp_path / "data"), \
             patch("shared.db.upsert") as mock_upsert:
            result = compute_for_cycle(2024, top_n=2)

        # Only top 2 per PAC
        assert result == 2

    def test_missing_parquet_returns_zero(self, mock_db, tmp_path):
        """If parquet file doesn't exist, returns 0."""
        from scripts.compute_pac_top_funders import compute_for_cycle

        with patch("scripts.compute_pac_top_funders.DATA_DIR", tmp_path / "data"):
            result = compute_for_cycle(2024)

        assert result == 0

    def test_no_canonical_donors_returns_zero(self, mock_db, mock_duckdb, tmp_path):
        """If no canonical donors in DB, returns 0."""
        from scripts.compute_pac_top_funders import compute_for_cycle

        data_dir = tmp_path / "data" / "fec" / "2024"
        data_dir.mkdir(parents=True)
        (data_dir / "indiv.parquet").touch()

        # Empty canonical donors
        mock_db["cursor"].fetchall.return_value = []

        with patch("scripts.compute_pac_top_funders.DATA_DIR", tmp_path / "data"):
            result = compute_for_cycle(2024)

        assert result == 0
