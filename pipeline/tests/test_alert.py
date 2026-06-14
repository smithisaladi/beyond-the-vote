"""Tests for scripts/alert.py."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest


class TestBuildAlertMessage:
    def test_success_basic(self):
        from scripts.alert import build_alert_message

        msg = build_alert_message(
            status="success",
            script="sync_weekly",
            rows_ingested=12345,
            tables_refreshed=8,
            duration_seconds=142,
        )
        assert "✅ Weekly pipeline complete" in msg
        assert "12,345 rows ingested" in msg
        assert "8 tables refreshed" in msg
        assert "142s" in msg

    def test_success_formats_duration_as_integer(self):
        from scripts.alert import build_alert_message

        msg = build_alert_message(
            status="success",
            script="sync_weekly",
            rows_ingested=0,
            tables_refreshed=0,
            duration_seconds=99.7,
        )
        assert "100s" in msg

    def test_failure_message(self):
        from scripts.alert import build_alert_message

        msg = build_alert_message(
            status="failed",
            script="sync_weekly",
            failed_step="fec_api",
            dead_letter_count=3,
        )
        assert "❌ sync_weekly failed at fec_api" in msg
        assert "3 dead-letter rows" in msg

    def test_failure_without_failed_step_uses_unknown(self):
        from scripts.alert import build_alert_message

        msg = build_alert_message(
            status="failed",
            script="sync_weekly",
        )
        assert "unknown step" in msg

    def test_stale_tables_appended(self):
        from scripts.alert import build_alert_message

        stale_tables = [
            {
                "schema_name": "congress",
                "table_name": "bills",
                "last_updated": datetime.now(timezone.utc) - timedelta(days=5),
            }
        ]
        msg = build_alert_message(
            status="success",
            script="sync_weekly",
            stale_tables=stale_tables,
        )
        assert "⚠️ congress.bills is 5 days stale" in msg

    def test_multiple_stale_tables(self):
        from scripts.alert import build_alert_message

        now = datetime.now(timezone.utc)
        stale_tables = [
            {
                "schema_name": "fec",
                "table_name": "pac_to_candidate",
                "last_updated": now - timedelta(days=10),
            },
            {
                "schema_name": "enrichment",
                "table_name": "donor_canonical",
                "last_updated": now - timedelta(days=20),
            },
        ]
        msg = build_alert_message(
            status="success",
            script="sync_weekly",
            stale_tables=stale_tables,
        )
        assert "⚠️ fec.pac_to_candidate is 10 days stale" in msg
        assert "⚠️ enrichment.donor_canonical is 20 days stale" in msg

    def test_stale_tables_on_failure(self):
        from scripts.alert import build_alert_message

        stale_tables = [
            {
                "schema_name": "congress",
                "table_name": "bills",
                "last_updated": datetime.now(timezone.utc) - timedelta(days=3),
            }
        ]
        msg = build_alert_message(
            status="failed",
            script="sync_weekly",
            failed_step="bills",
            stale_tables=stale_tables,
        )
        assert "❌" in msg
        assert "⚠️ congress.bills" in msg

    def test_dead_letter_count_appended_on_success(self):
        from scripts.alert import build_alert_message

        msg = build_alert_message(
            status="success",
            script="sync_weekly",
            dead_letter_count=7,
        )
        assert "7 unresolved dead-letter rows" in msg

    def test_no_dead_letter_line_when_zero_on_success(self):
        from scripts.alert import build_alert_message

        msg = build_alert_message(
            status="success",
            script="sync_weekly",
            dead_letter_count=0,
        )
        assert "dead-letter" not in msg

    def test_anomalies_appended(self):
        from scripts.alert import build_alert_message

        anomalies = ["sync_weekly ingested 100 rows (prev: 5,000) — investigate"]
        msg = build_alert_message(
            status="success",
            script="sync_weekly",
            anomalies=anomalies,
        )
        assert "🔍 sync_weekly ingested 100 rows" in msg

    def test_no_stale_tables_when_none(self):
        from scripts.alert import build_alert_message

        msg = build_alert_message(
            status="success",
            script="sync_weekly",
            stale_tables=None,
        )
        assert "stale" not in msg

    def test_no_anomaly_lines_when_empty(self):
        from scripts.alert import build_alert_message

        msg = build_alert_message(
            status="success",
            script="sync_weekly",
            anomalies=[],
        )
        assert "🔍" not in msg


class TestDetectAnomalies:
    @patch("scripts.alert.get_previous_metric" if False else "shared.metrics.get_previous_metric")
    def test_flags_when_below_50_percent(self, mock_prev):
        from scripts.alert import detect_anomalies

        with patch("shared.metrics.get_previous_metric", return_value=10000.0):
            result = detect_anomalies("sync_weekly", 4000)

        assert len(result) == 1
        assert "sync_weekly" in result[0]
        assert "4,000 rows" in result[0]
        assert "10,000" in result[0]
        assert "investigate" in result[0]

    def test_no_flag_when_above_50_percent(self):
        from scripts.alert import detect_anomalies

        with patch("shared.metrics.get_previous_metric", return_value=10000.0):
            result = detect_anomalies("sync_weekly", 6000)

        assert result == []

    def test_no_flag_when_no_previous(self):
        from scripts.alert import detect_anomalies

        with patch("shared.metrics.get_previous_metric", return_value=None):
            result = detect_anomalies("sync_weekly", 100)

        assert result == []

    def test_no_flag_when_previous_is_zero(self):
        from scripts.alert import detect_anomalies

        with patch("shared.metrics.get_previous_metric", return_value=0.0):
            result = detect_anomalies("sync_weekly", 0)

        assert result == []

    def test_exactly_50_percent_is_not_flagged(self):
        from scripts.alert import detect_anomalies

        with patch("shared.metrics.get_previous_metric", return_value=1000.0):
            result = detect_anomalies("sync_weekly", 500)

        assert result == []

    def test_just_below_50_percent_is_flagged(self):
        from scripts.alert import detect_anomalies

        with patch("shared.metrics.get_previous_metric", return_value=1000.0):
            result = detect_anomalies("sync_weekly", 499)

        assert len(result) == 1


class TestPostToSlack:
    @patch("requests.post")
    def test_posts_correct_json(self, mock_post):
        from scripts.alert import post_to_slack

        mock_resp = MagicMock()
        mock_resp.raise_for_status.return_value = None
        mock_post.return_value = mock_resp

        post_to_slack("https://hooks.slack.com/T123/abc", "Hello Slack")

        mock_post.assert_called_once_with(
            "https://hooks.slack.com/T123/abc",
            json={"text": "Hello Slack"},
            timeout=10,
        )

    @patch("requests.post")
    def test_empty_webhook_does_not_call_post(self, mock_post):
        from scripts.alert import post_to_slack

        post_to_slack("", "Hello Slack")

        mock_post.assert_not_called()

    @patch("requests.post")
    def test_request_error_is_logged_not_raised(self, mock_post):
        from scripts.alert import post_to_slack

        mock_post.side_effect = Exception("connection refused")

        # Should not raise
        post_to_slack("https://hooks.slack.com/T123/abc", "Hello Slack")

    @patch("requests.post")
    def test_http_error_is_logged_not_raised(self, mock_post):
        import requests as req
        from scripts.alert import post_to_slack

        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = req.HTTPError("400 Bad Request")
        mock_post.return_value = mock_resp

        # Should not raise
        post_to_slack("https://hooks.slack.com/T123/abc", "msg")

    @patch("requests.post")
    def test_posts_with_10s_timeout(self, mock_post):
        from scripts.alert import post_to_slack

        mock_resp = MagicMock()
        mock_resp.raise_for_status.return_value = None
        mock_post.return_value = mock_resp

        post_to_slack("https://hooks.slack.com/T123/abc", "msg")

        _, kwargs = mock_post.call_args
        assert kwargs["timeout"] == 10
