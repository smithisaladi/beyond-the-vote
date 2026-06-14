"""Tests for scripts/compute_pac_detail_cache.py."""
from unittest.mock import MagicMock, patch, call


class TestComputePacDetailCache:
    """Test compute_pac_detail_cache.main() with mocked DB."""

    def _make_mock_conn(self):
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        return mock_conn, mock_cur

    def test_executes_pac_detail_query(self):
        """main() executes the PAC detail SQL against the DB."""
        mock_conn, mock_cur = self._make_mock_conn()
        # fetchall: first call is the main query, second is the cycle query
        mock_cur.fetchall.return_value = []
        mock_cur.fetchone.return_value = (2024,)

        with patch("scripts.compute_pac_detail_cache.get_conn", return_value=mock_conn), \
             patch("scripts.compute_pac_detail_cache.log_run_start", return_value="run-1"), \
             patch("scripts.compute_pac_detail_cache.log_run_end"), \
             patch("scripts.compute_pac_detail_cache.record_freshness"), \
             patch("scripts.compute_pac_detail_cache.record_step_metrics"), \
             patch("scripts.compute_pac_detail_cache.upsert", return_value=0):
            from scripts.compute_pac_detail_cache import main
            main()

        # The main query should reference key FEC tables
        execute_calls = mock_cur.execute.call_args_list
        all_sql = " ".join(str(c) for c in execute_calls)
        assert "fec.pac_to_candidate" in all_sql
        assert "fec.independent_expenditures" in all_sql
        assert "fec.cmte_names" in all_sql
        assert "congress.legislators" in all_sql

    def test_deletes_then_upserts(self):
        """main() deletes existing rows then upserts fresh data."""
        mock_conn, mock_cur = self._make_mock_conn()
        mock_cur.fetchall.return_value = []
        mock_cur.fetchone.return_value = (2024,)

        with patch("scripts.compute_pac_detail_cache.get_conn", return_value=mock_conn), \
             patch("scripts.compute_pac_detail_cache.log_run_start", return_value="run-1"), \
             patch("scripts.compute_pac_detail_cache.log_run_end"), \
             patch("scripts.compute_pac_detail_cache.record_freshness"), \
             patch("scripts.compute_pac_detail_cache.record_step_metrics"), \
             patch("scripts.compute_pac_detail_cache.upsert", return_value=0) as mock_upsert:
            from scripts.compute_pac_detail_cache import main
            main()

        execute_calls = mock_cur.execute.call_args_list
        delete_calls = [c for c in execute_calls if "DELETE FROM derived.pac_detail_cache" in str(c)]
        assert len(delete_calls) == 1

    def test_upserts_all_rows(self):
        """main() builds a record per fetched row and upserts to pac_detail_cache."""
        mock_conn, mock_cur = self._make_mock_conn()

        # Simulate two rows returned from the main query
        mock_cur.fetchall.return_value = [
            ("C001", "ACME PAC", None, "H001", 5000.0, 0.0, 0.0, 5000.0, "B001", "SMITH, JANE", "D", "CA", "house"),
            ("C001", "ACME PAC", None, "H002", 0.0, 2000.0, 0.0, 2000.0, None, "DOE, JOHN", "R", "TX", None),
        ]
        mock_cur.fetchone.return_value = (2024,)
        mock_cur.description = [
            ("cmte_id",), ("cmte_name",), ("connected_org",), ("cand_id",),
            ("direct",), ("ie_for",), ("ie_against",), ("total_support",),
            ("bioguide_id",), ("full_name",), ("party",), ("state",), ("chamber",),
        ]

        captured_records = []
        def fake_upsert(table, records, on_conflict, schema):
            captured_records.extend(records)
            return len(records)

        with patch("scripts.compute_pac_detail_cache.get_conn", return_value=mock_conn), \
             patch("scripts.compute_pac_detail_cache.log_run_start", return_value="run-1"), \
             patch("scripts.compute_pac_detail_cache.log_run_end"), \
             patch("scripts.compute_pac_detail_cache.record_freshness"), \
             patch("scripts.compute_pac_detail_cache.record_step_metrics"), \
             patch("scripts.compute_pac_detail_cache.upsert", side_effect=fake_upsert):
            from scripts.compute_pac_detail_cache import main
            main()

        assert len(captured_records) == 2
        assert captured_records[0]["cmte_id"] == "C001"
        assert captured_records[0]["cand_id"] == "H001"
        assert captured_records[0]["direct"] == 5000.0
        assert captured_records[0]["cycle"] == 2024
        assert captured_records[1]["ie_for"] == 2000.0

    def test_upsert_conflict_key(self):
        """main() uses cmte_id,cand_id as the upsert conflict key."""
        mock_conn, mock_cur = self._make_mock_conn()
        mock_cur.fetchall.return_value = []
        mock_cur.fetchone.return_value = (2024,)

        upsert_kwargs = {}
        def capture_upsert(table, records, on_conflict, schema):
            upsert_kwargs["table"] = table
            upsert_kwargs["on_conflict"] = on_conflict
            upsert_kwargs["schema"] = schema
            return 0

        with patch("scripts.compute_pac_detail_cache.get_conn", return_value=mock_conn), \
             patch("scripts.compute_pac_detail_cache.log_run_start", return_value="run-1"), \
             patch("scripts.compute_pac_detail_cache.log_run_end"), \
             patch("scripts.compute_pac_detail_cache.record_freshness"), \
             patch("scripts.compute_pac_detail_cache.record_step_metrics"), \
             patch("scripts.compute_pac_detail_cache.upsert", side_effect=capture_upsert):
            from scripts.compute_pac_detail_cache import main
            main()

        assert upsert_kwargs["table"] == "pac_detail_cache"
        assert upsert_kwargs["on_conflict"] == "cmte_id,cand_id"
        assert upsert_kwargs["schema"] == "derived"

    def test_records_freshness_on_success(self):
        """main() calls record_freshness with the correct table after success."""
        mock_conn, mock_cur = self._make_mock_conn()
        mock_cur.fetchall.return_value = []
        mock_cur.fetchone.return_value = (2024,)

        with patch("scripts.compute_pac_detail_cache.get_conn", return_value=mock_conn), \
             patch("scripts.compute_pac_detail_cache.log_run_start", return_value="run-1"), \
             patch("scripts.compute_pac_detail_cache.log_run_end"), \
             patch("scripts.compute_pac_detail_cache.record_freshness") as mock_fresh, \
             patch("scripts.compute_pac_detail_cache.record_step_metrics"), \
             patch("scripts.compute_pac_detail_cache.upsert", return_value=0):
            from scripts.compute_pac_detail_cache import main
            main()

        mock_fresh.assert_called_once()
        args = mock_fresh.call_args
        assert args[0][0] == "derived"
        assert args[0][1] == "pac_detail_cache"

    def test_logs_run_end_failed_on_exception(self):
        """main() calls log_run_end with 'failed' status when an exception is raised."""
        mock_conn, mock_cur = self._make_mock_conn()
        mock_cur.execute.side_effect = RuntimeError("db error")

        with patch("scripts.compute_pac_detail_cache.get_conn", return_value=mock_conn), \
             patch("scripts.compute_pac_detail_cache.log_run_start", return_value="run-1"), \
             patch("scripts.compute_pac_detail_cache.log_run_end") as mock_end, \
             patch("scripts.compute_pac_detail_cache.record_freshness"), \
             patch("scripts.compute_pac_detail_cache.record_step_metrics"):
            import pytest
            with pytest.raises(RuntimeError):
                from scripts.compute_pac_detail_cache import main
                main()

        mock_end.assert_called_once()
        _, kwargs = mock_end.call_args
        assert kwargs.get("error_detail") or mock_end.call_args[0][1] == "failed"
