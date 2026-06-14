"""Tests for scripts/compute_pac_leaderboard.py."""
from unittest.mock import MagicMock, patch


class TestComputePacLeaderboard:
    """Test compute_pac_leaderboard.main() with mocked DB."""

    def _make_mock_conn(self):
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        return mock_conn, mock_cur

    def test_executes_leaderboard_query(self):
        """main() executes a query aggregating pac_to_candidate and independent_expenditures."""
        mock_conn, mock_cur = self._make_mock_conn()
        mock_cur.fetchall.return_value = []
        mock_cur.fetchone.return_value = (2024,)

        with patch("scripts.compute_pac_leaderboard.get_conn", return_value=mock_conn), \
             patch("scripts.compute_pac_leaderboard.log_run_start", return_value="run-1"), \
             patch("scripts.compute_pac_leaderboard.log_run_end"), \
             patch("scripts.compute_pac_leaderboard.record_freshness"), \
             patch("scripts.compute_pac_leaderboard.record_step_metrics"), \
             patch("scripts.compute_pac_leaderboard.upsert", return_value=0):
            from scripts.compute_pac_leaderboard import main
            main()

        all_sql = " ".join(str(c) for c in mock_cur.execute.call_args_list)
        assert "fec.pac_to_candidate" in all_sql
        assert "fec.independent_expenditures" in all_sql
        assert "fec.cmte_names" in all_sql

    def test_deletes_then_upserts(self):
        """main() deletes existing rows before inserting fresh data."""
        mock_conn, mock_cur = self._make_mock_conn()
        mock_cur.fetchall.return_value = []
        mock_cur.fetchone.return_value = (2024,)

        with patch("scripts.compute_pac_leaderboard.get_conn", return_value=mock_conn), \
             patch("scripts.compute_pac_leaderboard.log_run_start", return_value="run-1"), \
             patch("scripts.compute_pac_leaderboard.log_run_end"), \
             patch("scripts.compute_pac_leaderboard.record_freshness"), \
             patch("scripts.compute_pac_leaderboard.record_step_metrics"), \
             patch("scripts.compute_pac_leaderboard.upsert", return_value=0):
            from scripts.compute_pac_leaderboard import main
            main()

        delete_calls = [
            c for c in mock_cur.execute.call_args_list
            if "DELETE FROM derived.pac_leaderboard" in str(c)
        ]
        assert len(delete_calls) == 1

    def test_upserts_ranked_rows(self):
        """main() maps DB rows to leaderboard records with correct fields."""
        mock_conn, mock_cur = self._make_mock_conn()
        mock_cur.fetchall.return_value = [
            ("C001", "ACME PAC", 10000.0, 5000.0, 0.0, 15000.0, 1),
            ("C002", "BETA PAC", 0.0, 8000.0, 2000.0, 10000.0, 2),
        ]
        mock_cur.fetchone.return_value = (2024,)
        mock_cur.description = [
            ("cmte_id",), ("cmte_name",), ("direct_total",), ("ie_for_total",),
            ("ie_against_total",), ("total_contributions",), ("global_rank",),
        ]

        captured = []
        def fake_upsert(table, records, on_conflict, schema):
            captured.extend(records)
            return len(records)

        with patch("scripts.compute_pac_leaderboard.get_conn", return_value=mock_conn), \
             patch("scripts.compute_pac_leaderboard.log_run_start", return_value="run-1"), \
             patch("scripts.compute_pac_leaderboard.log_run_end"), \
             patch("scripts.compute_pac_leaderboard.record_freshness"), \
             patch("scripts.compute_pac_leaderboard.record_step_metrics"), \
             patch("scripts.compute_pac_leaderboard.upsert", side_effect=fake_upsert):
            from scripts.compute_pac_leaderboard import main
            main()

        assert len(captured) == 2
        assert captured[0]["cmte_id"] == "C001"
        assert captured[0]["global_rank"] == 1
        assert captured[0]["total_contributions"] == 15000.0
        assert captured[0]["cycle"] == 2024
        assert captured[1]["cmte_id"] == "C002"
        assert captured[1]["global_rank"] == 2

    def test_upsert_conflict_key(self):
        """main() uses cmte_id as the upsert conflict key."""
        mock_conn, mock_cur = self._make_mock_conn()
        mock_cur.fetchall.return_value = []
        mock_cur.fetchone.return_value = (2024,)

        upsert_kwargs = {}
        def capture_upsert(table, records, on_conflict, schema):
            upsert_kwargs["table"] = table
            upsert_kwargs["on_conflict"] = on_conflict
            upsert_kwargs["schema"] = schema
            return 0

        with patch("scripts.compute_pac_leaderboard.get_conn", return_value=mock_conn), \
             patch("scripts.compute_pac_leaderboard.log_run_start", return_value="run-1"), \
             patch("scripts.compute_pac_leaderboard.log_run_end"), \
             patch("scripts.compute_pac_leaderboard.record_freshness"), \
             patch("scripts.compute_pac_leaderboard.record_step_metrics"), \
             patch("scripts.compute_pac_leaderboard.upsert", side_effect=capture_upsert):
            from scripts.compute_pac_leaderboard import main
            main()

        assert upsert_kwargs["table"] == "pac_leaderboard"
        assert upsert_kwargs["on_conflict"] == "cmte_id"
        assert upsert_kwargs["schema"] == "derived"

    def test_records_freshness_on_success(self):
        """main() calls record_freshness for the pac_leaderboard table."""
        mock_conn, mock_cur = self._make_mock_conn()
        mock_cur.fetchall.return_value = []
        mock_cur.fetchone.return_value = (2024,)

        with patch("scripts.compute_pac_leaderboard.get_conn", return_value=mock_conn), \
             patch("scripts.compute_pac_leaderboard.log_run_start", return_value="run-1"), \
             patch("scripts.compute_pac_leaderboard.log_run_end"), \
             patch("scripts.compute_pac_leaderboard.record_freshness") as mock_fresh, \
             patch("scripts.compute_pac_leaderboard.record_step_metrics"), \
             patch("scripts.compute_pac_leaderboard.upsert", return_value=0):
            from scripts.compute_pac_leaderboard import main
            main()

        mock_fresh.assert_called_once()
        assert mock_fresh.call_args[0][0] == "derived"
        assert mock_fresh.call_args[0][1] == "pac_leaderboard"

    def test_logs_run_end_failed_on_exception(self):
        """main() calls log_run_end with 'failed' on exception."""
        mock_conn, mock_cur = self._make_mock_conn()
        mock_cur.execute.side_effect = RuntimeError("db error")

        with patch("scripts.compute_pac_leaderboard.get_conn", return_value=mock_conn), \
             patch("scripts.compute_pac_leaderboard.log_run_start", return_value="run-1"), \
             patch("scripts.compute_pac_leaderboard.log_run_end") as mock_end, \
             patch("scripts.compute_pac_leaderboard.record_freshness"), \
             patch("scripts.compute_pac_leaderboard.record_step_metrics"):
            import pytest
            with pytest.raises(RuntimeError):
                from scripts.compute_pac_leaderboard import main
                main()

        mock_end.assert_called_once()
        call_args = mock_end.call_args
        status = call_args[0][1] if len(call_args[0]) > 1 else call_args[1].get("status")
        assert status == "failed"
