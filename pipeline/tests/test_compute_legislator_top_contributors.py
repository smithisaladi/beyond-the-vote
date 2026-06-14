"""Tests for scripts/compute_legislator_top_contributors.py."""
from unittest.mock import MagicMock, patch


class TestComputeLegislatorTopContributors:
    """Test compute_legislator_top_contributors.main() with mocked DB."""

    def _make_mock_conn(self):
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        return mock_conn, mock_cur

    def test_executes_top_contributors_query(self):
        """main() executes a query referencing legislators and FEC contribution tables."""
        mock_conn, mock_cur = self._make_mock_conn()
        mock_cur.fetchall.return_value = []
        mock_cur.fetchone.return_value = (2024,)

        with patch("scripts.compute_legislator_top_contributors.get_conn", return_value=mock_conn), \
             patch("scripts.compute_legislator_top_contributors.log_run_start", return_value="run-1"), \
             patch("scripts.compute_legislator_top_contributors.log_run_end"), \
             patch("scripts.compute_legislator_top_contributors.record_freshness"), \
             patch("scripts.compute_legislator_top_contributors.record_step_metrics"), \
             patch("scripts.compute_legislator_top_contributors.upsert", return_value=0):
            from scripts.compute_legislator_top_contributors import main
            main()

        all_sql = " ".join(str(c) for c in mock_cur.execute.call_args_list)
        assert "congress.legislators" in all_sql
        assert "fec.pac_to_candidate" in all_sql
        assert "fec.independent_expenditures" in all_sql
        assert "fec.cmte_names" in all_sql

    def test_query_ranks_top_10(self):
        """The SQL query filters to rank <= 10."""
        from scripts.compute_legislator_top_contributors import _SQL
        assert "rank <= 10" in _SQL

    def test_query_partitions_by_bioguide(self):
        """The SQL query partitions the RANK window by bioguide_id."""
        from scripts.compute_legislator_top_contributors import _SQL
        assert "PARTITION BY bioguide_id" in _SQL

    def test_deletes_before_upsert(self):
        """main() clears the table before inserting fresh data."""
        mock_conn, mock_cur = self._make_mock_conn()
        mock_cur.fetchall.return_value = []
        mock_cur.fetchone.return_value = (2024,)

        with patch("scripts.compute_legislator_top_contributors.get_conn", return_value=mock_conn), \
             patch("scripts.compute_legislator_top_contributors.log_run_start", return_value="run-1"), \
             patch("scripts.compute_legislator_top_contributors.log_run_end"), \
             patch("scripts.compute_legislator_top_contributors.record_freshness"), \
             patch("scripts.compute_legislator_top_contributors.record_step_metrics"), \
             patch("scripts.compute_legislator_top_contributors.upsert", return_value=0):
            from scripts.compute_legislator_top_contributors import main
            main()

        delete_calls = [
            c for c in mock_cur.execute.call_args_list
            if "DELETE FROM derived.legislator_top_contributors" in str(c)
        ]
        assert len(delete_calls) == 1

    def test_upserts_top_contributor_rows(self):
        """main() maps DB rows to correct record structure."""
        mock_conn, mock_cur = self._make_mock_conn()
        mock_cur.fetchall.return_value = [
            ("B001", "C001", "ACME CORP", 10000.0, 5000.0, 15000.0, 1),
            ("B001", "C002", "BETA INC", 0.0, 8000.0, 8000.0, 2),
            ("B002", "C001", "ACME CORP", 3000.0, 0.0, 3000.0, 1),
        ]
        mock_cur.fetchone.return_value = (2024,)
        mock_cur.description = [
            ("bioguide_id",), ("cmte_id",), ("org_name",),
            ("direct",), ("ie_for",), ("total",), ("rank",),
        ]

        captured = []
        def fake_upsert(table, records, on_conflict, schema):
            captured.extend(records)
            return len(records)

        with patch("scripts.compute_legislator_top_contributors.get_conn", return_value=mock_conn), \
             patch("scripts.compute_legislator_top_contributors.log_run_start", return_value="run-1"), \
             patch("scripts.compute_legislator_top_contributors.log_run_end"), \
             patch("scripts.compute_legislator_top_contributors.record_freshness"), \
             patch("scripts.compute_legislator_top_contributors.record_step_metrics"), \
             patch("scripts.compute_legislator_top_contributors.upsert", side_effect=fake_upsert):
            from scripts.compute_legislator_top_contributors import main
            main()

        assert len(captured) == 3
        assert captured[0]["bioguide_id"] == "B001"
        assert captured[0]["cmte_id"] == "C001"
        assert captured[0]["org_name"] == "ACME CORP"
        assert captured[0]["direct"] == 10000.0
        assert captured[0]["ie_for"] == 5000.0
        assert captured[0]["total"] == 15000.0
        assert captured[0]["rank"] == 1
        assert captured[0]["cycle"] == 2024

    def test_upsert_conflict_key(self):
        """main() uses bioguide_id,cmte_id as the upsert conflict key."""
        mock_conn, mock_cur = self._make_mock_conn()
        mock_cur.fetchall.return_value = []
        mock_cur.fetchone.return_value = (2024,)

        upsert_kwargs = {}
        def capture_upsert(table, records, on_conflict, schema):
            upsert_kwargs["table"] = table
            upsert_kwargs["on_conflict"] = on_conflict
            upsert_kwargs["schema"] = schema
            return 0

        with patch("scripts.compute_legislator_top_contributors.get_conn", return_value=mock_conn), \
             patch("scripts.compute_legislator_top_contributors.log_run_start", return_value="run-1"), \
             patch("scripts.compute_legislator_top_contributors.log_run_end"), \
             patch("scripts.compute_legislator_top_contributors.record_freshness"), \
             patch("scripts.compute_legislator_top_contributors.record_step_metrics"), \
             patch("scripts.compute_legislator_top_contributors.upsert", side_effect=capture_upsert):
            from scripts.compute_legislator_top_contributors import main
            main()

        assert upsert_kwargs["table"] == "legislator_top_contributors"
        assert upsert_kwargs["on_conflict"] == "bioguide_id,cmte_id"
        assert upsert_kwargs["schema"] == "derived"

    def test_records_freshness_on_success(self):
        """main() calls record_freshness for the legislator_top_contributors table."""
        mock_conn, mock_cur = self._make_mock_conn()
        mock_cur.fetchall.return_value = []
        mock_cur.fetchone.return_value = (2024,)

        with patch("scripts.compute_legislator_top_contributors.get_conn", return_value=mock_conn), \
             patch("scripts.compute_legislator_top_contributors.log_run_start", return_value="run-1"), \
             patch("scripts.compute_legislator_top_contributors.log_run_end"), \
             patch("scripts.compute_legislator_top_contributors.record_freshness") as mock_fresh, \
             patch("scripts.compute_legislator_top_contributors.record_step_metrics"), \
             patch("scripts.compute_legislator_top_contributors.upsert", return_value=0):
            from scripts.compute_legislator_top_contributors import main
            main()

        mock_fresh.assert_called_once()
        assert mock_fresh.call_args[0][0] == "derived"
        assert mock_fresh.call_args[0][1] == "legislator_top_contributors"

    def test_logs_run_end_failed_on_exception(self):
        """main() calls log_run_end with 'failed' on exception."""
        mock_conn, mock_cur = self._make_mock_conn()
        mock_cur.execute.side_effect = RuntimeError("db error")

        with patch("scripts.compute_legislator_top_contributors.get_conn", return_value=mock_conn), \
             patch("scripts.compute_legislator_top_contributors.log_run_start", return_value="run-1"), \
             patch("scripts.compute_legislator_top_contributors.log_run_end") as mock_end, \
             patch("scripts.compute_legislator_top_contributors.record_freshness"), \
             patch("scripts.compute_legislator_top_contributors.record_step_metrics"):
            import pytest
            with pytest.raises(RuntimeError):
                from scripts.compute_legislator_top_contributors import main
                main()

        mock_end.assert_called_once()
        call_args = mock_end.call_args
        status = call_args[0][1] if len(call_args[0]) > 1 else call_args[1].get("status")
        assert status == "failed"
