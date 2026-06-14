"""Tests for shared/metrics.py."""
from unittest.mock import MagicMock, call, patch


class TestRecordMetric:
    @patch("shared.metrics.get_conn")
    def test_inserts_metric_row(self, mock_get_conn):
        from shared.metrics import record_metric

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn

        record_metric(
            run_id="run-1",
            script_name="ingest_bills",
            metric_name="rows_ingested",
            metric_value=250,
        )

        mock_cur.execute.assert_called_once()
        sql, params = mock_cur.execute.call_args[0]
        assert "INSERT INTO ops.pipeline_metrics" in sql
        assert params[0] == "run-1"
        assert params[1] == "ingest_bills"
        assert params[2] == "rows_ingested"
        assert params[3] == 250

    @patch("shared.metrics.get_conn")
    def test_accepts_float_value(self, mock_get_conn):
        from shared.metrics import record_metric

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn

        record_metric(
            run_id="run-2",
            script_name="embed_bills",
            metric_name="duration_seconds",
            metric_value=12.34,
        )

        _, params = mock_cur.execute.call_args[0]
        assert params[3] == 12.34


class TestRecordStepMetrics:
    @patch("shared.metrics.record_metric")
    def test_records_all_four_metrics(self, mock_record_metric):
        from shared.metrics import record_step_metrics

        record_step_metrics(
            run_id="run-1",
            script_name="ingest_fec",
            rows_ingested=1000,
            rows_upserted=950,
            rows_dead_lettered=5,
            duration_seconds=30.5,
        )

        assert mock_record_metric.call_count == 4

        calls = {c.kwargs["metric_name"]: c.kwargs["metric_value"] for c in mock_record_metric.call_args_list}
        assert calls["rows_ingested"] == 1000
        assert calls["rows_upserted"] == 950
        assert calls["rows_dead_lettered"] == 5
        assert calls["duration_seconds"] == 30.5

    @patch("shared.metrics.record_metric")
    def test_passes_run_id_and_script_name_to_all(self, mock_record_metric):
        from shared.metrics import record_step_metrics

        record_step_metrics(run_id="run-xyz", script_name="sync_bills")

        for c in mock_record_metric.call_args_list:
            assert c.kwargs["run_id"] == "run-xyz"
            assert c.kwargs["script_name"] == "sync_bills"

    @patch("shared.metrics.record_metric")
    def test_defaults_all_to_zero(self, mock_record_metric):
        from shared.metrics import record_step_metrics

        record_step_metrics(run_id="run-1", script_name="test_script")

        calls = {c.kwargs["metric_name"]: c.kwargs["metric_value"] for c in mock_record_metric.call_args_list}
        assert calls["rows_ingested"] == 0
        assert calls["rows_upserted"] == 0
        assert calls["rows_dead_lettered"] == 0
        assert calls["duration_seconds"] == 0


class TestGetPreviousMetric:
    @patch("shared.metrics.get_conn")
    def test_returns_float_when_row_exists(self, mock_get_conn):
        from shared.metrics import get_previous_metric

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn
        mock_cur.fetchone.return_value = (42,)

        result = get_previous_metric("ingest_bills", "rows_ingested")

        assert result == 42.0
        assert isinstance(result, float)

    @patch("shared.metrics.get_conn")
    def test_returns_none_when_no_prior_run(self, mock_get_conn):
        from shared.metrics import get_previous_metric

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn
        mock_cur.fetchone.return_value = None

        result = get_previous_metric("new_script", "rows_ingested")

        assert result is None

    @patch("shared.metrics.get_conn")
    def test_queries_most_recent_by_recorded_at(self, mock_get_conn):
        from shared.metrics import get_previous_metric

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur
        mock_get_conn.return_value = mock_conn
        mock_cur.fetchone.return_value = (100,)

        get_previous_metric("sync_daily", "duration_seconds")

        sql, params = mock_cur.execute.call_args[0]
        assert "ORDER BY recorded_at DESC" in sql
        assert "LIMIT 1 OFFSET 1" in sql
        assert params == ("sync_daily", "duration_seconds")
