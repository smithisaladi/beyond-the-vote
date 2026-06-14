"""Pipeline metrics — records per-step numeric metrics to ops.pipeline_metrics."""
from __future__ import annotations

import structlog

from shared.db import get_conn

log = structlog.get_logger()


def record_metric(
    *,
    run_id: str,
    script_name: str,
    metric_name: str,
    metric_value: float | int,
) -> None:
    """Insert a single metric row into ops.pipeline_metrics."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO ops.pipeline_metrics
            (run_id, script_name, metric_name, metric_value)
        VALUES (%s, %s, %s, %s)
        """,
        (run_id, script_name, metric_name, metric_value),
    )
    log.debug(
        "metric_recorded",
        script=script_name,
        metric=metric_name,
        value=metric_value,
    )


def record_step_metrics(
    *,
    run_id: str,
    script_name: str,
    rows_ingested: int = 0,
    rows_upserted: int = 0,
    rows_dead_lettered: int = 0,
    duration_seconds: float = 0,
) -> None:
    """Record all four standard per-step metrics in one call."""
    metrics = {
        "rows_ingested": rows_ingested,
        "rows_upserted": rows_upserted,
        "rows_dead_lettered": rows_dead_lettered,
        "duration_seconds": duration_seconds,
    }
    for name, value in metrics.items():
        record_metric(
            run_id=run_id,
            script_name=script_name,
            metric_name=name,
            metric_value=value,
        )
    log.info(
        "step_metrics_recorded",
        script=script_name,
        **metrics,
    )


def get_previous_metric(script_name: str, metric_name: str) -> float | None:
    """Return the second-most-recent recorded value for a given script + metric.

    Skips the current run (OFFSET 1) so anomaly detection compares against
    the prior run, not itself. Returns None if no prior run exists.
    """
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT metric_value
        FROM ops.pipeline_metrics
        WHERE script_name = %s AND metric_name = %s
        ORDER BY recorded_at DESC
        LIMIT 1 OFFSET 1
        """,
        (script_name, metric_name),
    )
    row = cur.fetchone()
    return float(row[0]) if row else None
