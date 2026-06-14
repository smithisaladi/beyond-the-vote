"""Compute PAC detail cache from FEC tables.

Pre-computes derived.pac_detail_cache by joining fec.pac_to_candidate,
fec.independent_expenditures, fec.cmte_names, congress.legislators, and
fec.candidates. One row per (cmte_id, cand_id) pair.

Usage: uv run python -m scripts.compute_pac_detail_cache
"""
import time

from dotenv import load_dotenv
load_dotenv()

from shared.observability import configure_logging
from shared.db import get_conn, log_run_start, log_run_end, upsert
from shared.freshness import record_freshness
from shared.metrics import record_step_metrics

import structlog
configure_logging(service="pipeline", debug=True)
log = structlog.get_logger()

SCRIPT = "compute_pac_detail_cache"

_SQL = """
WITH direct AS (
    SELECT cmte_id, cand_id,
           SUM(transaction_amt) AS direct_total
    FROM fec.pac_to_candidate
    GROUP BY cmte_id, cand_id
),
ie_for AS (
    SELECT cmte_id, cand_id,
           SUM(transaction_amt) AS ie_for_total
    FROM fec.independent_expenditures
    WHERE sup_opp = 'S'
    GROUP BY cmte_id, cand_id
),
ie_against AS (
    SELECT cmte_id, cand_id,
           SUM(transaction_amt) AS ie_against_total
    FROM fec.independent_expenditures
    WHERE sup_opp = 'O'
    GROUP BY cmte_id, cand_id
),
combined AS (
    SELECT
        COALESCE(d.cmte_id, f.cmte_id, a.cmte_id) AS cmte_id,
        COALESCE(d.cand_id, f.cand_id, a.cand_id) AS cand_id,
        COALESCE(d.direct_total, 0) AS direct,
        COALESCE(f.ie_for_total, 0) AS ie_for,
        COALESCE(a.ie_against_total, 0) AS ie_against
    FROM direct d
    FULL OUTER JOIN ie_for f ON d.cmte_id = f.cmte_id AND d.cand_id = f.cand_id
    FULL OUTER JOIN ie_against a
        ON COALESCE(d.cmte_id, f.cmte_id) = a.cmte_id
        AND COALESCE(d.cand_id, f.cand_id) = a.cand_id
)
SELECT
    c.cmte_id,
    cn.cmte_name,
    cn.connected_org,
    c.cand_id,
    c.direct,
    c.ie_for,
    c.ie_against,
    c.direct + c.ie_for AS total_support,
    l.bioguide_id,
    COALESCE(l.full_name, fc.cand_name) AS full_name,
    COALESCE(l.party, fc.cand_party) AS party,
    COALESCE(l.state, fc.cand_state) AS state,
    l.chamber
FROM combined c
LEFT JOIN fec.cmte_names cn ON cn.cmte_id = c.cmte_id
LEFT JOIN congress.legislators l ON c.cand_id = ANY(l.fec_ids)
LEFT JOIN fec.candidates fc ON fc.cand_id = c.cand_id
WHERE c.direct + c.ie_for + c.ie_against > 0
"""


def main() -> None:
    run_id = log_run_start(SCRIPT)
    start_time = time.monotonic()
    try:
        conn = get_conn()
        cur = conn.cursor()

        log.info("executing_pac_detail_query")
        cur.execute(_SQL)
        rows = cur.fetchall()
        cols = [desc[0] for desc in cur.description]
        log.info("pac_detail_rows_fetched", count=len(rows))

        # Determine the most recent cycle for computed_at metadata
        cur.execute("SELECT MAX(cycle) FROM fec.pac_to_candidate")
        cycle_row = cur.fetchone()
        cycle = cycle_row[0] if cycle_row else None

        cur.execute("DELETE FROM derived.pac_detail_cache")
        log.info("pac_detail_cache_cleared")

        records = []
        for row in rows:
            r = dict(zip(cols, row))
            records.append({
                "cmte_id": r["cmte_id"],
                "cycle": cycle,
                "cmte_name": r.get("cmte_name"),
                "connected_org": r.get("connected_org"),
                "cand_id": r["cand_id"],
                "bioguide_id": r.get("bioguide_id"),
                "full_name": r.get("full_name"),
                "party": r.get("party"),
                "state": r.get("state"),
                "chamber": r.get("chamber"),
                "direct": float(r.get("direct") or 0),
                "ie_for": float(r.get("ie_for") or 0),
                "ie_against": float(r.get("ie_against") or 0),
                "total_support": float(r.get("total_support") or 0),
            })

        count = upsert("pac_detail_cache", records,
                       on_conflict="cmte_id,cand_id", schema="derived")
        log.info("pac_detail_cache_upserted", count=count)

        conn.close()
        record_freshness("derived", "pac_detail_cache", rows_affected=count, run_id=run_id)
        duration = time.monotonic() - start_time
        record_step_metrics(
            run_id=run_id, script_name=SCRIPT,
            rows_ingested=len(rows), rows_upserted=count,
            rows_dead_lettered=0, duration_seconds=round(duration, 1),
        )
        log_run_end(run_id, "success", rows_processed=count)
        log.info("compute_pac_detail_cache_complete", rows=count)

    except Exception as e:
        log.error("compute_pac_detail_cache_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        raise


if __name__ == "__main__":
    main()
