"""Pipeline alerting script — checks freshness, dead letters, anomalies, and posts to Slack.

Usage: cd pipeline && uv run python -m scripts.alert --status success --run-id <run_id>
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv()

from shared.observability import configure_logging

import structlog

configure_logging(service="pipeline")
log = structlog.get_logger()

SCRIPT = "alert"


def build_alert_message(
    *,
    status: str,
    script: str,
    rows_ingested: int = 0,
    tables_refreshed: int = 0,
    duration_seconds: float = 0,
    failed_step: str | None = None,
    stale_tables: list[dict] | None = None,
    dead_letter_count: int = 0,
    anomalies: list[str] | None = None,
) -> str:
    """Build a Slack alert message from pipeline run results."""
    lines: list[str] = []

    if status == "success":
        lines.append(
            f"✅ Weekly pipeline complete — {rows_ingested:,} rows ingested, "
            f"{tables_refreshed} tables refreshed, {duration_seconds:.0f}s"
        )
        if dead_letter_count > 0:
            lines.append(f"⚠️ {dead_letter_count} unresolved dead-letter rows")
    else:
        step_label = failed_step or "unknown step"
        lines.append(
            f"❌ {script} failed at {step_label} — {dead_letter_count} dead-letter rows"
        )

    if stale_tables:
        for table in stale_tables:
            schema = table.get("schema_name", "")
            name = table.get("table_name", "")
            last_updated = table.get("last_updated")
            if last_updated is not None:
                now = datetime.now(timezone.utc)
                if hasattr(last_updated, "tzinfo") and last_updated.tzinfo is None:
                    last_updated = last_updated.replace(tzinfo=timezone.utc)
                age_days = (now - last_updated).days
            else:
                age_days = 0
            lines.append(f"⚠️ {schema}.{name} is {age_days} days stale")

    if anomalies:
        for anomaly in anomalies:
            lines.append(f"🔍 {anomaly}")

    return "\n".join(lines)


def detect_anomalies(script: str, rows_ingested: int) -> list[str]:
    """Compare rows_ingested to previous run; flag if < 50% of previous."""
    from shared.metrics import get_previous_metric

    anomalies: list[str] = []
    prev = get_previous_metric(script, "rows_ingested")
    if prev is not None and prev > 0 and rows_ingested < prev * 0.5:
        anomalies.append(
            f"{script} ingested {rows_ingested:,} rows (prev: {prev:,.0f}) — investigate"
        )
    return anomalies


def post_to_slack(webhook_url: str, message: str) -> None:
    """POST message to a Slack incoming webhook."""
    import requests

    if not webhook_url:
        log.warning("slack_webhook_not_configured", message="Slack webhook URL is empty; skipping post")
        return

    try:
        resp = requests.post(
            webhook_url,
            json={"text": message},
            timeout=10,
        )
        resp.raise_for_status()
        log.info("slack_alert_posted", status_code=resp.status_code)
    except Exception as exc:
        log.error("slack_alert_failed", error=str(exc))


def main() -> None:
    parser = argparse.ArgumentParser(description="Post pipeline alert to Slack")
    parser.add_argument(
        "--status",
        default="success",
        choices=["success", "failed"],
        help="Overall pipeline status",
    )
    parser.add_argument(
        "--failed-step",
        default=None,
        help="Name of the step that failed (if status=failed)",
    )
    parser.add_argument(
        "--run-id",
        default=None,
        help="Pipeline run ID to look up metrics for",
    )
    args = parser.parse_args()

    from shared.freshness import check_staleness
    from shared.dead_letter import get_unresolved_count

    # Check staleness
    try:
        stale_tables = check_staleness()
    except Exception as exc:
        log.error("staleness_check_failed", error=str(exc))
        stale_tables = []

    # Check dead letters
    try:
        dead_letter_count = get_unresolved_count()
    except Exception as exc:
        log.error("dead_letter_check_failed", error=str(exc))
        dead_letter_count = 0

    # Query metrics from ops.pipeline_metrics if run_id provided
    rows_ingested = 0
    tables_refreshed = 0
    duration_seconds = 0.0

    if args.run_id:
        try:
            from shared.db import get_conn

            conn = get_conn()
            cur = conn.cursor()
            cur.execute(
                """
                SELECT metric_name, SUM(metric_value)
                FROM ops.pipeline_metrics
                WHERE run_id = %s
                GROUP BY metric_name
                """,
                (args.run_id,),
            )
            for metric_name, metric_value in cur.fetchall():
                if metric_name == "rows_upserted":
                    rows_ingested = int(metric_value)
                elif metric_name == "duration_seconds":
                    duration_seconds = float(metric_value)
        except Exception as exc:
            log.error("metrics_query_failed", run_id=args.run_id, error=str(exc))

    # Detect anomalies on success
    anomalies: list[str] = []
    if args.status == "success":
        try:
            script_name = args.run_id.split("-")[0] if args.run_id else SCRIPT
            anomalies = detect_anomalies(script_name, rows_ingested)
        except Exception as exc:
            log.error("anomaly_detection_failed", error=str(exc))

    message = build_alert_message(
        status=args.status,
        script=args.run_id or SCRIPT,
        rows_ingested=rows_ingested,
        tables_refreshed=tables_refreshed,
        duration_seconds=duration_seconds,
        failed_step=args.failed_step,
        stale_tables=stale_tables,
        dead_letter_count=dead_letter_count,
        anomalies=anomalies,
    )

    log.info("alert_message_built", status=args.status, lines=len(message.splitlines()))

    webhook_url = os.getenv("SLACK_WEBHOOK_URL", "")
    post_to_slack(webhook_url, message)


if __name__ == "__main__":
    main()
