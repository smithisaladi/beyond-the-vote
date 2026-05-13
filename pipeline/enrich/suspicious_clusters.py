"""Tier 3a: Suspicious contribution cluster detection.

Identifies potential straw donor schemes — clusters of small donors with no
political history, all giving similar amounts to the same recipient on close dates,
sharing employer or address features.

Outputs are LEADS for investigation, not conclusions. UI must frame accordingly.
"""
from collections import defaultdict
from pathlib import Path

import structlog

from shared.db import upsert, get_conn
from shared.parquet import duckdb_connect

log = structlog.get_logger()

MODEL_VERSION = "suspicious_clusters_v1_rules"


def _score_event(donors: list[dict]) -> tuple[float, dict]:
    """Score a cluster of same-day, same-committee contributions for suspiciousness.

    Returns (score 0-1, signals dict).
    """
    signals = {}
    score = 0.0

    # Signal 1: Many donors on same day to same committee
    count = len(donors)
    if count >= 5:
        signals["same_day_cluster_size"] = count
        score += min(0.3, count * 0.03)

    # Signal 2: First-time donors (no prior contributions)
    # Approximated by checking if most donors in the cluster are unique
    unique_names = len({d.get("name", "") for d in donors})
    if count >= 3 and unique_names >= count * 0.8:
        signals["high_unique_donor_ratio"] = round(unique_names / max(count, 1), 2)
        score += 0.15

    # Signal 3: Similar amounts (low variance)
    amounts = [float(d.get("transaction_amt") or 0) for d in donors if d.get("transaction_amt")]
    if len(amounts) >= 3:
        mean_amt = sum(amounts) / len(amounts)
        variance = sum((a - mean_amt) ** 2 for a in amounts) / len(amounts)
        std_dev = variance ** 0.5
        cv = std_dev / mean_amt if mean_amt > 0 else 0
        if cv < 0.1:  # Very low coefficient of variation
            signals["similar_amounts"] = {"mean": round(mean_amt, 2), "cv": round(cv, 3)}
            score += 0.2

    # Signal 4: Shared employer
    employers = [d.get("employer", "").strip().upper() for d in donors if d.get("employer")]
    if employers:
        from collections import Counter
        emp_counts = Counter(employers)
        most_common_emp, most_common_count = emp_counts.most_common(1)[0]
        if most_common_count >= count * 0.5 and most_common_emp:
            signals["shared_employer"] = {"employer": most_common_emp, "count": most_common_count}
            score += 0.2

    # Signal 5: Shared ZIP code
    zips = [str(d.get("zip_code", ""))[:5] for d in donors if d.get("zip_code")]
    if zips:
        from collections import Counter
        zip_counts = Counter(zips)
        most_common_zip, zip_count = zip_counts.most_common(1)[0]
        if zip_count >= count * 0.5 and most_common_zip:
            signals["shared_zip"] = {"zip": most_common_zip, "count": zip_count}
            score += 0.15

    return min(score, 1.0), signals


def detect_suspicious_clusters(
    parquet_path: Path,
    min_cluster_size: int = 5,
    min_score: float = 0.3,
) -> list[dict]:
    """Detect suspicious contribution clusters from individual contributions.

    Groups contributions by (committee, date) and scores each group.
    """
    log.info("scanning_for_suspicious_clusters", min_size=min_cluster_size, min_score=min_score)

    with duckdb_connect() as conn:
        # Find (committee, date) pairs with many contributions
        df = conn.execute(f"""
            SELECT cmte_id, transaction_dt, name, employer, zip_code, transaction_amt,
                   CAST(sub_id AS VARCHAR) as sub_id
            FROM read_parquet('{parquet_path}')
            WHERE transaction_dt IS NOT NULL AND transaction_dt != ''
              AND (entity_tp = 'IND' OR entity_tp = '' OR entity_tp IS NULL)
        """).fetchdf()

    # Group by (cmte_id, date)
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for _, row in df.iterrows():
        cmte = str(row.get("cmte_id") or "")
        dt = str(row.get("transaction_dt") or "")
        if cmte and dt:
            groups[(cmte, dt)].append(row.to_dict())

    log.info("contribution_groups_built", groups=len(groups))

    events = []
    for (cmte_id, date), donors in groups.items():
        if len(donors) < min_cluster_size:
            continue

        score, signals = _score_event(donors)
        if score < min_score:
            continue

        total_amount = sum(float(d.get("transaction_amt") or 0) for d in donors)
        confidence = min(score, 0.95)

        events.append({
            "committee_id": cmte_id,
            "event_date": date if len(date) >= 8 else None,
            "donor_count": len(donors),
            "total_amount": round(total_amount, 2),
            "signals": signals,
            "score": round(score, 3),
            "confidence": round(confidence, 3),
            "model_version": MODEL_VERSION,
        })

    # Sort by score descending
    events.sort(key=lambda e: e["score"], reverse=True)
    log.info("suspicious_events_detected", count=len(events))
    return events


def run_suspicious_clusters(parquet_path: Path) -> int:
    """Run suspicious cluster detection and upload results."""
    events = detect_suspicious_clusters(parquet_path)

    if not events:
        log.info("no_suspicious_events_found")
        return 0

    # Filter out events with None dates
    events = [e for e in events if e.get("event_date")]

    # Clear old results
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM anomalies.suspicious_contribution_events WHERE model_version = %s", (MODEL_VERSION,))

    import json
    for e in events:
        e["signals"] = json.dumps(e["signals"])

    total = upsert("suspicious_contribution_events", events, schema="anomalies")
    log.info("suspicious_clusters_uploaded", count=total)
    return total
