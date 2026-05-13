"""Tests for shared/db.py."""
import json
import pytest
from unittest.mock import patch, MagicMock, call
from datetime import datetime, timezone


# ── get_conn tests ───────────────────────────────────────────────────────────


class TestGetConn:
    def setup_method(self):
        """Reset the global _conn before each test."""
        import shared.db
        shared.db._conn = None

    @patch("shared.db.psycopg2.extras.register_default_jsonb")
    @patch("shared.db.psycopg2.connect")
    def test_returns_connection(self, mock_connect, mock_jsonb):
        from shared.db import get_conn
        mock_conn = MagicMock()
        mock_conn.closed = False
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        with patch.dict("os.environ", {"DATABASE_URL": "postgres://test"}):
            conn = get_conn()

        assert conn is mock_conn
        mock_connect.assert_called_once_with("postgres://test")
        assert mock_conn.autocommit is True

    @patch("shared.db.psycopg2.extras.register_default_jsonb")
    @patch("shared.db.psycopg2.connect")
    def test_auto_reconnects_on_closed_connection(self, mock_connect, mock_jsonb):
        from shared.db import get_conn
        import shared.db

        # Set up a "closed" connection
        old_conn = MagicMock()
        old_conn.closed = True
        shared.db._conn = old_conn

        new_conn = MagicMock()
        new_conn.closed = False
        new_cursor = MagicMock()
        new_conn.cursor.return_value = new_cursor
        mock_connect.return_value = new_conn

        with patch.dict("os.environ", {"DATABASE_URL": "postgres://test"}):
            conn = get_conn()

        assert conn is new_conn
        mock_connect.assert_called_once()

    @patch("shared.db.psycopg2.extras.register_default_jsonb")
    @patch("shared.db.psycopg2.connect")
    def test_reconnects_when_select1_fails(self, mock_connect, mock_jsonb):
        from shared.db import get_conn
        import shared.db

        # Connection appears open but SELECT 1 fails
        broken_conn = MagicMock()
        broken_conn.closed = False
        broken_cursor = MagicMock()
        broken_cursor.execute.side_effect = Exception("connection lost")
        broken_conn.cursor.return_value = broken_cursor
        shared.db._conn = broken_conn

        new_conn = MagicMock()
        new_conn.closed = False
        new_cursor = MagicMock()
        new_conn.cursor.return_value = new_cursor
        mock_connect.return_value = new_conn

        with patch.dict("os.environ", {"DATABASE_URL": "postgres://test"}):
            conn = get_conn()

        assert conn is new_conn

    @patch("shared.db.psycopg2.extras.register_default_jsonb")
    @patch("shared.db.psycopg2.connect")
    def test_reuses_healthy_connection(self, mock_connect, mock_jsonb):
        from shared.db import get_conn
        import shared.db

        existing_conn = MagicMock()
        existing_conn.closed = False
        existing_cursor = MagicMock()
        existing_conn.cursor.return_value = existing_cursor
        shared.db._conn = existing_conn

        conn = get_conn()
        assert conn is existing_conn
        mock_connect.assert_not_called()


# ── upsert tests ─────────────────────────────────────────────────────────────


class TestUpsert:
    @patch("shared.db.psycopg2.extras.execute_batch")
    @patch("shared.db.get_conn")
    def test_builds_correct_sql_with_on_conflict(self, mock_get_conn, mock_exec_batch):
        from shared.db import upsert

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_get_conn.return_value = mock_conn

        rows = [{"id": 1, "name": "test", "value": 100}]
        result = upsert("my_table", rows, on_conflict="id", schema="public")

        assert result == 1
        mock_exec_batch.assert_called_once()

    @patch("shared.db.psycopg2.extras.execute_batch")
    @patch("shared.db.get_conn")
    def test_on_conflict_do_update_sql(self, mock_get_conn, mock_exec_batch):
        from shared.db import upsert

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_get_conn.return_value = mock_conn

        rows = [{"id": 1, "name": "test", "value": 100}]
        upsert("my_table", rows, on_conflict="id", schema="enrichment")

        sql = mock_exec_batch.call_args[0][1]
        assert "INSERT INTO enrichment.my_table" in sql
        assert "ON CONFLICT (id) DO UPDATE SET" in sql
        assert "name = EXCLUDED.name" in sql
        assert "value = EXCLUDED.value" in sql

    @patch("shared.db.psycopg2.extras.execute_batch")
    @patch("shared.db.get_conn")
    def test_no_conflict_do_nothing_sql(self, mock_get_conn, mock_exec_batch):
        from shared.db import upsert

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_get_conn.return_value = mock_conn

        rows = [{"id": 1, "name": "test"}]
        upsert("my_table", rows, schema="public")

        sql = mock_exec_batch.call_args[0][1]
        assert "ON CONFLICT DO NOTHING" in sql

    @patch("shared.db.psycopg2.extras.execute_batch")
    @patch("shared.db.get_conn")
    def test_handles_batch_sizes(self, mock_get_conn, mock_exec_batch):
        from shared.db import upsert

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_get_conn.return_value = mock_conn

        rows = [{"id": i, "name": f"test_{i}"} for i in range(7)]
        result = upsert("my_table", rows, batch_size=3)

        assert result == 7
        # Should be called 3 times: batches of 3, 3, 1
        assert mock_exec_batch.call_count == 3

    @patch("shared.db.get_conn")
    def test_empty_rows_returns_zero(self, mock_get_conn):
        from shared.db import upsert
        result = upsert("my_table", [])
        assert result == 0
        mock_get_conn.assert_not_called()

    @patch("shared.db.psycopg2.extras.execute_batch")
    @patch("shared.db.get_conn")
    def test_returns_total_row_count(self, mock_get_conn, mock_exec_batch):
        from shared.db import upsert

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_get_conn.return_value = mock_conn

        rows = [{"id": i} for i in range(10)]
        result = upsert("t", rows, batch_size=500)
        assert result == 10


# ── log_run_start / log_run_end tests ────────────────────────────────────────


class TestLogRun:
    @patch("shared.db.get_conn")
    def test_log_run_start_creates_record(self, mock_get_conn):
        from shared.db import log_run_start

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_get_conn.return_value = mock_conn

        run_id = log_run_start("test_script")

        assert isinstance(run_id, str)
        assert len(run_id) == 36  # UUID format
        mock_cursor.execute.assert_called_once()
        sql = mock_cursor.execute.call_args[0][0]
        assert "INSERT INTO ops.pipeline_runs" in sql
        params = mock_cursor.execute.call_args[0][1]
        assert params[0] == run_id
        assert params[1] == "test_script"
        assert params[2] == "running"

    @patch("shared.db.get_conn")
    def test_log_run_end_updates_record(self, mock_get_conn):
        from shared.db import log_run_end

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_get_conn.return_value = mock_conn

        log_run_end("test-run-id", "success", rows_processed=42)

        mock_cursor.execute.assert_called_once()
        sql = mock_cursor.execute.call_args[0][0]
        assert "UPDATE ops.pipeline_runs" in sql
        params = mock_cursor.execute.call_args[0][1]
        assert params[0] == "success"
        assert isinstance(params[1], datetime)
        assert params[2] == 42
        assert params[3] is None  # error_detail
        assert params[4] is None  # metadata
        assert params[5] == "test-run-id"

    @patch("shared.db.get_conn")
    def test_log_run_end_with_error(self, mock_get_conn):
        from shared.db import log_run_end

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_get_conn.return_value = mock_conn

        log_run_end("fail-id", "failed", error_detail="something broke")

        params = mock_cursor.execute.call_args[0][1]
        assert params[0] == "failed"
        assert params[3] == "something broke"

    @patch("shared.db.get_conn")
    def test_log_run_end_with_metadata(self, mock_get_conn):
        from shared.db import log_run_end

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_get_conn.return_value = mock_conn

        meta = {"cycles": [2024, 2026]}
        log_run_end("meta-id", "success", metadata=meta)

        params = mock_cursor.execute.call_args[0][1]
        assert params[4] == json.dumps(meta)
