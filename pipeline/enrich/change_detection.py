"""Tier 3b: Committee behavioral change detection.

Builds monthly time series per committee and applies change-point detection
to find committees whose giving patterns shifted dramatically.

Uses the `ruptures` library (PELT algorithm) for change-point detection.
"""
from collections import defaultdict
from pathlib import Path

import numpy as np
import structlog

from shared.db import upsert, get_conn
from shared.parquet import duckdb_connect

log = structlog.get_logger()

MODEL_VERSION = "change_detection_v1_pelt"


def build_committee_timeseries(parquet_path: Path) -> dict[str, list[dict]]:
    """Build monthly time series per committee from PAC contributions.

    Returns: {cmte_id: [{month: "2025-01", total: 50000, count: 15, ...}, ...]}
    """
    with duckdb_connect() as conn:
        df = conn.execute(f"""
            SELECT cmte_id,
                   SUBSTRING(transaction_dt, 5, 4) || '-' || SUBSTRING(transaction_dt, 1, 2) as month,
                   SUM(CAST(transaction_amt AS DOUBLE)) as total,
                   COUNT(*) as count
            FROM read_parquet('{parquet_path}')
            WHERE transaction_dt IS NOT NULL
              AND LENGTH(transaction_dt) >= 8
              AND transaction_tp IN ('24K', '24Z', '24E', '24A')
            GROUP BY cmte_id, month
            ORDER BY cmte_id, month
        """).fetchdf()

    series: dict[str, list[dict]] = defaultdict(list)
    for _, row in df.iterrows():
        cmte = str(row.get("cmte_id") or "")
        month = str(row.get("month") or "")
        if cmte and month and len(month) == 7:
            series[cmte].append({
                "month": month,
                "total": float(row.get("total") or 0),
                "count": int(row.get("count") or 0),
            })

    log.info("committee_timeseries_built", committees=len(series))
    return dict(series)


def detect_change_points(
    values: list[float],
    min_size: int = 3,
    penalty: float = 1.0,
) -> list[int]:
    """Detect change points in a time series using PELT algorithm.

    Returns list of change point indices.
    """
    if len(values) < min_size * 2:
        return []

    try:
        import ruptures as rpt
        signal = np.array(values)
        algo = rpt.Pelt(model="rbf", min_size=min_size).fit(signal)
        change_points = algo.predict(pen=penalty)
        # ruptures returns the last index as a "change point" — remove it
        return [cp for cp in change_points if cp < len(values)]
    except Exception as e:
        log.debug("change_detection_failed", error=str(e))
        return []


def analyze_committee_changes(
    cmte_id: str,
    timeseries: list[dict],
    min_months: int = 6,
) -> list[dict]:
    """Analyze a single committee's timeseries for behavioral changes.

    Returns list of detected change points with metadata.
    """
    if len(timeseries) < min_months:
        return []

    changes = []

    # Detect changes in spending level
    totals = [m["total"] for m in timeseries]
    spend_cps = detect_change_points(totals)

    for cp_idx in spend_cps:
        if cp_idx <= 0 or cp_idx >= len(timeseries):
            continue

        before = totals[max(0, cp_idx - 3):cp_idx]
        after = totals[cp_idx:min(len(totals), cp_idx + 3)]

        if not before or not after:
            continue

        before_avg = sum(before) / len(before)
        after_avg = sum(after) / len(after)

        if before_avg == 0 and after_avg == 0:
            continue

        magnitude = abs(after_avg - before_avg) / max(before_avg, after_avg, 1)
        direction = "increase" if after_avg > before_avg else "decrease"

        # Only report significant changes
        if magnitude < 0.3:
            continue

        confidence = min(0.95, 0.5 + magnitude * 0.3)

        changes.append({
            "committee_id": cmte_id,
            "change_date": timeseries[cp_idx]["month"] + "-01",
            "metric": "spend_rate",
            "magnitude": round(magnitude, 3),
            "direction": direction,
            "confidence": round(confidence, 3),
            "model_version": MODEL_VERSION,
        })

    # Detect changes in contribution count (activity level)
    counts = [float(m["count"]) for m in timeseries]
    count_cps = detect_change_points(counts)

    for cp_idx in count_cps:
        if cp_idx <= 0 or cp_idx >= len(timeseries):
            continue

        before = counts[max(0, cp_idx - 3):cp_idx]
        after = counts[cp_idx:min(len(counts), cp_idx + 3)]

        if not before or not after:
            continue

        before_avg = sum(before) / len(before)
        after_avg = sum(after) / len(after)

        if before_avg == 0 and after_avg == 0:
            continue

        magnitude = abs(after_avg - before_avg) / max(before_avg, after_avg, 1)
        direction = "increase" if after_avg > before_avg else "decrease"

        if magnitude < 0.3:
            continue

        confidence = min(0.95, 0.5 + magnitude * 0.3)

        changes.append({
            "committee_id": cmte_id,
            "change_date": timeseries[cp_idx]["month"] + "-01",
            "metric": "activity_level",
            "magnitude": round(magnitude, 3),
            "direction": direction,
            "confidence": round(confidence, 3),
            "model_version": MODEL_VERSION,
        })

    return changes


def run_change_detection(parquet_path: Path) -> int:
    """Run change detection across all committees. Returns rows uploaded."""
    timeseries = build_committee_timeseries(parquet_path)

    all_changes = []
    for cmte_id, series in timeseries.items():
        changes = analyze_committee_changes(cmte_id, series)
        all_changes.extend(changes)

    log.info("change_points_detected", total=len(all_changes),
             committees_with_changes=len({c["committee_id"] for c in all_changes}))

    if not all_changes:
        return 0

    # Clear old results
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(f"DELETE FROM anomalies.committee_change_points WHERE model_version = '{MODEL_VERSION}'")

    total = upsert("committee_change_points", all_changes, schema="anomalies")
    log.info("change_points_uploaded", count=total)
    return total
