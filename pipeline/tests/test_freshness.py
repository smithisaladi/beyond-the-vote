"""Tests for shared/freshness.py."""
from unittest.mock import MagicMock, call, patch

import pytest


class TestRecordFreshness:
    @patch("shared.freshness.get_conn")
    def test_upserts_with_default_staleness(self, mock_get_conn):
        from shared.freshness import record_freshness

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn

        record_freshness("congress", "bills", rows_affected=50)

        mock_cur.execute.assert_called_once()
        sql, params = mock_cur.execute.call_args[0]
        assert "INSERT INTO ops.data_freshness" in sql
        assert "ON CONFLICT" in sql
        assert params[0] == "congress"
        assert params[1] == "bills"
        assert params[2] == 50
        assert params[3] is None  # run_id
        assert params[4] == "2 days"

    @patch("shared.freshness.get_conn")
    def test_passes_run_id(self, mock_get_conn):
        from shared.freshness import record_freshness

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn

        record_freshness("fec", "pac_to_candidate", rows_affected=10, run_id="abc-123")

        _, params = mock_cur.execute.call_args[0]
        assert params[3] == "abc-123"
        assert params[4] == "8 days"

    @patch("shared.freshness.get_conn")
    def test_unknown_table_defaults_to_8_days(self, mock_get_conn):
        from shared.freshness import record_freshness

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn

        record_freshness("public", "some_unknown_table")

        _, params = mock_cur.execute.call_args[0]
        assert params[4] == "8 days"

    @patch("shared.freshness.get_conn")
    def test_enrichment_donor_canonical_uses_15_days(self, mock_get_conn):
        from shared.freshness import record_freshness

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn

        record_freshness("enrichment", "donor_canonical")

        _, params = mock_cur.execute.call_args[0]
        assert params[4] == "15 days"


class TestCheckStaleness:
    @patch("shared.freshness.get_conn")
    def test_returns_list_of_stale_tables(self, mock_get_conn):
        from shared.freshness import check_staleness

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn

        from datetime import datetime, timezone
        ts = datetime(2024, 1, 1, tzinfo=timezone.utc)
        mock_cur.fetchall.return_value = [
            ("congress", "bills", ts, 100, None, "2 days"),
            ("fec", "pac_to_candidate", ts, 0, "run-1", "8 days"),
        ]

        result = check_staleness()

        assert len(result) == 2
        assert result[0]["schema_name"] == "congress"
        assert result[0]["table_name"] == "bills"
        assert result[1]["run_id"] == "run-1"

    @patch("shared.freshness.get_conn")
    def test_executes_staleness_query(self, mock_get_conn):
        from shared.freshness import check_staleness

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn
        mock_cur.fetchall.return_value = []

        check_staleness()

        mock_cur.execute.assert_called_once()
        sql = mock_cur.execute.call_args[0][0]
        assert "last_updated + max_staleness < now()" in sql

    @patch("shared.freshness.get_conn")
    def test_returns_empty_list_when_none_stale(self, mock_get_conn):
        from shared.freshness import check_staleness

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn
        mock_cur.fetchall.return_value = []

        result = check_staleness()
        assert result == []


class TestGetAllFreshness:
    @patch("shared.freshness.get_conn")
    def test_returns_all_rows(self, mock_get_conn):
        from shared.freshness import get_all_freshness

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn

        from datetime import datetime, timezone
        ts = datetime(2024, 6, 1, tzinfo=timezone.utc)
        mock_cur.fetchall.return_value = [
            ("analytics", "money_flow_attribution", ts, 500, "run-xyz", "8 days"),
        ]

        result = get_all_freshness()

        assert len(result) == 1
        assert result[0]["schema_name"] == "analytics"
        assert result[0]["rows_affected"] == 500

    @patch("shared.freshness.get_conn")
    def test_selects_all_columns(self, mock_get_conn):
        from shared.freshness import get_all_freshness

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn
        mock_cur.fetchall.return_value = []

        get_all_freshness()

        sql = mock_cur.execute.call_args[0][0]
        assert "SELECT" in sql
        assert "FROM ops.data_freshness" in sql


class TestStalenessThresholds:
    def test_all_expected_tables_present(self):
        from shared.freshness import STALENESS_THRESHOLDS

        expected = [
            ("congress", "bills"),
            ("congress", "bill_vote_summaries"),
            ("fec", "pac_to_candidate"),
            ("fec", "independent_expenditures"),
            ("enrichment", "donor_canonical"),
            ("enrichment", "bill_embeddings"),
            ("derived", "pac_top_funders"),
            ("derived", "pac_detail_cache"),
            ("derived", "pac_leaderboard"),
            ("derived", "legislator_top_contributors"),
            ("derived", "legislator_funding_summary"),
            ("analytics", "money_flow_attribution"),
        ]
        for key in expected:
            assert key in STALENESS_THRESHOLDS, f"Missing threshold for {key}"

    def test_bill_embeddings_uses_2_days(self):
        from shared.freshness import STALENESS_THRESHOLDS
        assert STALENESS_THRESHOLDS[("enrichment", "bill_embeddings")] == "2 days"
