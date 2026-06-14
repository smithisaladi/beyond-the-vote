"""Compute top individual funders per PAC using canonical donor data + raw contributions.

Joins individual contributions (from indiv.parquet) with canonical donors to get
per-PAC amounts with deduplicated donor identities.

Usage:
    uv run python -m scripts.compute_pac_top_funders [--top-n 10] [--cycles 2024,2026]
"""
import argparse
import sys
import time
from collections import defaultdict
from pathlib import Path

import pandas as pd
import structlog

from shared.db import get_conn, log_run_start, log_run_end, reset_conn, upsert
from shared.freshness import record_freshness
from shared.metrics import record_step_metrics
from shared.observability import configure_logging, configure_sentry
from shared.parquet import duckdb_connect

SCRIPT = "compute_pac_top_funders"
DATA_DIR = Path(__file__).parent.parent / "data"
log = structlog.get_logger()


def compute_for_cycle(cycle: int, top_n: int = 10) -> int:
    indiv_parquet = DATA_DIR / "fec" / str(cycle) / "indiv.parquet"
    if not indiv_parquet.exists():
        log.warning("indiv_parquet_missing", cycle=cycle)
        return 0

    conn = get_conn()
    cur = conn.cursor()

    # Load canonical donors from DB: canonical_id -> (display_name, employer, state, confidence)
    cur.execute("""
        SELECT canonical_id, display_name, employer, state, confidence
        FROM enrichment.donor_canonical
    """)
    canonical_info: dict[str, tuple[str, str | None, str | None, float]] = {}
    for cid, name, emp, state, conf in cur.fetchall():
        canonical_info[cid] = (name, emp, state, conf)

    if not canonical_info:
        log.warning("no_canonical_donors", cycle=cycle)
        return 0

    log.info("canonical_info_loaded", count=len(canonical_info))

    # Build sub_id -> canonical_id lookup from the blocking/resolution approach:
    # We need to map individual contributions to their canonical donor.
    # Since donor_canonical now stores condensed rows, we rebuild the mapping
    # by matching (name, employer, zip) from parquet against canonical donors.
    # Simpler approach: use the cmte_ids array to know which PACs a donor gave to,
    # then read per-PAC amounts from parquet grouped by the same blocking key.

    # Actually, the most reliable approach: re-run blocking on the parquet,
    # but only for donors that exist in canonical (above $200).
    # For each block, group by exact (name, employer) -> canonical_id,
    # then aggregate per (canonical_id, cmte_id).

    reset_conn()

    # Build canonical lookup DataFrame from already-loaded canonical_info.
    # Join with contributions in DuckDB to avoid a Python iterrows() loop
    # over potentially millions of contribution groups.
    canonical_df = pd.DataFrame(
        [
            {
                "name_lower": (name or "").lower(),
                "employer_lower": (emp or "").lower(),
                "canonical_id": cid,
            }
            for cid, (name, emp, _state, _conf) in canonical_info.items()
        ]
    )

    log.info("canonical_lookup_built", entries=len(canonical_df))

    with duckdb_connect() as duck:
        duck.register("canonical_lookup", canonical_df)
        joined = duck.execute(f"""
            SELECT cl.canonical_id,
                   c.cmte_id,
                   SUM(c.total_amt) AS total_amt,
                   SUM(c.cnt)       AS cnt
            FROM (
                SELECT LOWER(name)                          AS name_lower,
                       LOWER(COALESCE(employer, ''))        AS employer_lower,
                       cmte_id,
                       SUM(CAST(transaction_amt AS DOUBLE)) AS total_amt,
                       COUNT(*)                             AS cnt
                FROM read_parquet('{indiv_parquet}')
                WHERE (entity_tp = 'IND' OR entity_tp = '' OR entity_tp IS NULL)
                  AND CAST(transaction_amt AS DOUBLE) > 0
                GROUP BY name_lower, employer_lower, cmte_id
            ) c
            JOIN canonical_lookup cl
              ON c.name_lower     = cl.name_lower
             AND c.employer_lower = cl.employer_lower
            GROUP BY cl.canonical_id, c.cmte_id
            HAVING SUM(c.total_amt) >= 200
        """).fetchdf()

    log.info("contributions_matched", matched=len(joined))

    # Rank top N per PAC. `joined` is already aggregated per (canonical_id, cmte_id)
    # so this groupby operates over a small result set bounded by num_pacs × donors_per_pac.
    pac_donors: dict[str, list[tuple[str, float, int]]] = defaultdict(list)
    for cmte_id_val, group in joined.groupby("cmte_id"):
        for _, row in group.iterrows():
            pac_donors[str(cmte_id_val)].append((
                str(row["canonical_id"]),
                float(row["total_amt"]),
                int(row["cnt"]),
            ))

    rows = []
    for cmte_id, donors in pac_donors.items():
        donors.sort(key=lambda x: x[1], reverse=True)
        for rank, (canonical_id, amount, count) in enumerate(donors[:top_n], 1):
            info = canonical_info.get(canonical_id)
            if not info:
                continue
            name, employer, state, confidence = info
            rows.append({
                "cmte_id": cmte_id,
                "canonical_donor_id": canonical_id,
                "display_name": name,
                "employer": employer,
                "state": state,
                "total_amount": round(amount, 2),
                "contribution_count": count,
                "confidence": round(confidence, 3),
                "rank": rank,
                "cycle": cycle,
            })

    log.info("top_funders_computed", rows=len(rows), pacs=len(pac_donors))

    conn = get_conn()
    conn.autocommit = False
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM derived.pac_top_funders WHERE cycle = %s", (cycle,))
        cur.close()
        if rows:
            upsert("pac_top_funders", rows, on_conflict="cmte_id, cycle, canonical_donor_id", schema="derived")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.autocommit = True

    log.info("pac_top_funders_loaded", cycle=cycle, rows=len(rows))
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cycles", type=str, default="2024,2026")
    parser.add_argument("--top-n", type=int, default=10)
    args = parser.parse_args()
    cycles = [int(c) for c in args.cycles.split(",")]

    configure_logging(service="pipeline")
    configure_sentry(service="pipeline")

    run_id = log_run_start(SCRIPT)
    start_time = time.monotonic()
    total = 0

    try:
        for cycle in cycles:
            log.info("processing_cycle", cycle=cycle)
            total += compute_for_cycle(cycle, top_n=args.top_n)
        record_freshness("derived", "pac_top_funders", rows_affected=total, run_id=run_id)
        duration = time.monotonic() - start_time
        record_step_metrics(
            run_id=run_id, script_name=SCRIPT,
            rows_ingested=total, rows_upserted=total,
            rows_dead_lettered=0, duration_seconds=round(duration, 1),
        )
        log_run_end(run_id, "success", rows_processed=total)
        log.info("compute_complete", total_rows=total)
    except Exception as e:
        log.error("compute_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
