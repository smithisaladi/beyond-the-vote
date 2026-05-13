"""Compute top individual funders per PAC using canonical donor data + raw contributions.

Joins individual contributions (from indiv.parquet) with canonical donors to get
per-PAC amounts with deduplicated donor identities.

Usage:
    uv run python -m scripts.compute_pac_top_funders [--top-n 10] [--cycles 2024,2026]
"""
import argparse
import sys
from collections import defaultdict
from pathlib import Path

import structlog

from shared.db import get_conn, log_run_start, log_run_end, reset_conn
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

    # Load contributions with DuckDB, aggregate per (name_lower, employer_lower, zip5, cmte_id)
    with duckdb_connect() as duck:
        df = duck.execute(f"""
            SELECT LOWER(name) as name_lower,
                   LOWER(COALESCE(employer, '')) as employer_lower,
                   SUBSTRING(zip_code, 1, 5) as zip5,
                   cmte_id,
                   SUM(CAST(transaction_amt AS DOUBLE)) as total_amt,
                   COUNT(*) as cnt
            FROM read_parquet('{indiv_parquet}')
            WHERE (entity_tp = 'IND' OR entity_tp = '' OR entity_tp IS NULL)
              AND CAST(transaction_amt AS DOUBLE) > 0
            GROUP BY name_lower, employer_lower, zip5, cmte_id
        """).fetchdf()

    log.info("contribution_groups_loaded", rows=len(df))

    # Build a lookup from canonical donors: (name_lower, employer_lower) -> canonical_id
    # This mirrors the fast-path in donor_resolution: same name+employer = same person
    name_emp_to_canonical: dict[str, str] = {}
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT canonical_id, display_name, employer FROM enrichment.donor_canonical")
    for cid, name, emp in cur.fetchall():
        key = f"{(name or '').lower()}|{(emp or '').lower()}"
        name_emp_to_canonical[key] = cid

    log.info("name_employer_index_built", entries=len(name_emp_to_canonical))
    reset_conn()

    # Aggregate per (canonical_id, cmte_id)
    pac_donor_amounts: dict[tuple[str, str], float] = defaultdict(float)
    pac_donor_counts: dict[tuple[str, str], int] = defaultdict(int)
    matched = 0

    for _, row in df.iterrows():
        key = f"{row['name_lower']}|{row['employer_lower']}"
        canonical_id = name_emp_to_canonical.get(key)
        if not canonical_id:
            continue
        matched += 1
        cmte_id = str(row["cmte_id"])
        pac_donor_amounts[(cmte_id, canonical_id)] += float(row["total_amt"])
        pac_donor_counts[(cmte_id, canonical_id)] += int(row["cnt"])

    log.info("contributions_matched", matched=matched, total_groups=len(df))

    # Rank top N per PAC
    from collections import defaultdict as dd
    pac_donors: dict[str, list[tuple[str, float, int]]] = dd(list)
    for (cmte_id, canonical_id), amount in pac_donor_amounts.items():
        if amount >= 200:
            count = pac_donor_counts[(cmte_id, canonical_id)]
            pac_donors[cmte_id].append((canonical_id, amount, count))

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
    cur = conn.cursor()
    cur.execute("DELETE FROM derived.pac_top_funders WHERE cycle = %s", (cycle,))

    if rows:
        from shared.db import upsert
        upsert("pac_top_funders", rows, on_conflict="cmte_id, cycle, canonical_donor_id", schema="derived")

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
    total = 0

    try:
        for cycle in cycles:
            log.info("processing_cycle", cycle=cycle)
            total += compute_for_cycle(cycle, top_n=args.top_n)
        log_run_end(run_id, "success", rows_processed=total)
        log.info("compute_complete", total_rows=total)
    except Exception as e:
        log.error("compute_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
