"""Tests for shared/dead_letter.py."""
import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch


class TestRecordDeadLetter:
    @patch("shared.dead_letter.get_conn")
    def test_inserts_row(self, mock_get_conn):
        from shared.dead_letter import record_dead_letter

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn

        record_dead_letter(
            run_id="run-1",
            source_table="congress.bills",
            source_key={"bill_id": "hr1-118"},
            raw_data={"title": "Some Bill", "status": "active"},
            error="KeyError: 'sponsor'",
        )

        mock_cur.execute.assert_called_once()
        sql, params = mock_cur.execute.call_args[0]
        assert "INSERT INTO ops.dead_letter" in sql
        assert params[0] == "run-1"
        assert params[1] == "congress.bills"
        assert json.loads(params[2]) == {"bill_id": "hr1-118"}
        assert json.loads(params[3]) == {"title": "Some Bill", "status": "active"}
        assert params[4] == "KeyError: 'sponsor'"

    @patch("shared.dead_letter.get_conn")
    def test_accepts_none_run_id(self, mock_get_conn):
        from shared.dead_letter import record_dead_letter

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn

        record_dead_letter(
            run_id=None,
            source_table="fec.pac_to_candidate",
            source_key={"fec_id": "C001"},
            raw_data={"amount": 5000},
            error="ValueError: negative amount",
        )

        _, params = mock_cur.execute.call_args[0]
        assert params[0] is None


class TestGetUnresolvedCount:
    @patch("shared.dead_letter.get_conn")
    def test_returns_count(self, mock_get_conn):
        from shared.dead_letter import get_unresolved_count

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn
        mock_cur.fetchone.return_value = (7,)

        result = get_unresolved_count()

        assert result == 7
        sql = mock_cur.execute.call_args[0][0]
        assert "COUNT(*)" in sql
        assert "NOT resolved" in sql

    @patch("shared.dead_letter.get_conn")
    def test_returns_zero_on_none(self, mock_get_conn):
        from shared.dead_letter import get_unresolved_count

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn
        mock_cur.fetchone.return_value = None

        result = get_unresolved_count()
        assert result == 0


class TestFetchUnresolved:
    @patch("shared.dead_letter.get_conn")
    def test_returns_list_of_dicts(self, mock_get_conn):
        from shared.dead_letter import fetch_unresolved

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn

        ts = datetime(2024, 1, 1, tzinfo=timezone.utc)
        mock_cur.fetchall.return_value = [
            ("uuid-1", "run-1", "congress.bills", {"bill_id": "hr1"}, {"x": 1}, "err", ts, None, False),
        ]

        result = fetch_unresolved()

        assert len(result) == 1
        assert result[0]["id"] == "uuid-1"
        assert result[0]["source_table"] == "congress.bills"
        assert result[0]["resolved"] is False

    @patch("shared.dead_letter.get_conn")
    def test_passes_limit_to_query(self, mock_get_conn):
        from shared.dead_letter import fetch_unresolved

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn
        mock_cur.fetchall.return_value = []

        fetch_unresolved(limit=25)

        _, params = mock_cur.execute.call_args[0]
        assert params == (25,)

    @patch("shared.dead_letter.get_conn")
    def test_default_limit_is_100(self, mock_get_conn):
        from shared.dead_letter import fetch_unresolved

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn
        mock_cur.fetchall.return_value = []

        fetch_unresolved()

        _, params = mock_cur.execute.call_args[0]
        assert params == (100,)

    @patch("shared.dead_letter.get_conn")
    def test_filters_unresolved_only(self, mock_get_conn):
        from shared.dead_letter import fetch_unresolved

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn
        mock_cur.fetchall.return_value = []

        fetch_unresolved()

        sql = mock_cur.execute.call_args[0][0]
        assert "NOT resolved" in sql


class TestMarkResolved:
    @patch("shared.dead_letter.get_conn")
    def test_updates_resolved_and_retried_at(self, mock_get_conn):
        from shared.dead_letter import mark_resolved

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn

        mark_resolved("uuid-abc")

        mock_cur.execute.assert_called_once()
        sql, params = mock_cur.execute.call_args[0]
        assert "resolved = TRUE" in sql
        assert "retried_at = now()" in sql
        assert params == ("uuid-abc",)
