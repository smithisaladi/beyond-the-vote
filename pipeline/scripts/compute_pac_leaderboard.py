"""Compute PAC leaderboard from FEC tables.

Pre-computes derived.pac_leaderboard by aggregating fec.pac_to_candidate and
fec.independent_expenditures, joining fec.cmte_names, and ranking PACs by
total contributions (direct + IE).

Usage: uv run python -m scripts.compute_pac_leaderboard
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

SCRIPT = "compute_pac_leaderboard"

_SQL = """
WITH pac_totals AS (
    SELECT cmte_id, SUM(transaction_amt) AS direct_total
    FROM fec.pac_to_candidate
    GROUP BY cmte_id
),
ie_totals AS (
    SELECT cmte_id,
           SUM(CASE WHEN sup_opp = 'S' THEN transaction_amt ELSE 0 END) AS ie_for_total,
           SUM(CASE WHEN sup_opp = 'O' THEN transaction_amt ELSE 0 END) AS ie_against_total
    FROM fec.independent_expenditures
    GROUP BY cmte_id
),
combined AS (
    SELECT
        COALESCE(p.cmte_id, ie.cmte_id) AS cmte_id,
        COALESCE(p.direct_total, 0) AS direct_total,
        COALESCE(ie.ie_for_total, 0) AS ie_for_total,
        COALESCE(ie.ie_against_total, 0) AS ie_against_total,
        COALESCE(p.direct_total, 0)
            + COALESCE(ie.ie_for_total, 0)
            + COALESCE(ie.ie_against_total, 0) AS total_contributions
    FROM pac_totals p
    FULL OUTER JOIN ie_totals ie ON p.cmte_id = ie.cmte_id
),
ranked AS (
    SELECT
        c.cmte_id,
        cn.cmte_name,
        c.direct_total,
        c.ie_for_total,
        c.ie_against_total,
        c.total_contributions,
        ROW_NUMBER() OVER (ORDER BY c.total_contributions DESC) AS global_rank
    FROM combined c
    LEFT JOIN fec.cmte_names cn ON cn.cmte_id = c.cmte_id
    WHERE cn.cmte_name IS NOT NULL
)
SELECT cmte_id, cmte_name, direct_total, ie_for_total, ie_against_total,
       total_contributions, global_rank
FROM ranked
ORDER BY global_rank
"""


def main() -> None:
    run_id = log_run_start(SCRIPT)
    start_time = time.monotonic()
    try:
        conn = get_conn()
        cur = conn.cursor()

        # Determine the most recent cycle for metadata
        cur.execute("SELECT MAX(cycle) FROM fec.pac_to_candidate")
        cycle_row = cur.fetchone()
        cycle = cycle_row[0] if cycle_row else None

        log.info("executing_pac_leaderboard_query")
        cur.execute(_SQL)
        rows = cur.fetchall()
        cols = [desc[0] for desc in cur.description]
        log.info("pac_leaderboard_rows_fetched", count=len(rows))

        cur.execute("DELETE FROM derived.pac_leaderboard")
        log.info("pac_leaderboard_cleared")

        records = []
        for row in rows:
            r = dict(zip(cols, row))
            records.append({
                "cmte_id": r["cmte_id"],
                "cmte_name": r.get("cmte_name"),
                "direct_total": float(r.get("direct_total") or 0),
                "ie_for_total": float(r.get("ie_for_total") or 0),
                "ie_against_total": float(r.get("ie_against_total") or 0),
                "total_contributions": float(r.get("total_contributions") or 0),
                "global_rank": int(r["global_rank"]),
                "cycle": cycle,
            })

        count = upsert("pac_leaderboard", records,
                       on_conflict="cmte_id", schema="derived")
        log.info("pac_leaderboard_upserted", count=count)

        conn.close()
        record_freshness("derived", "pac_leaderboard", rows_affected=count, run_id=run_id)
        duration = time.monotonic() - start_time
        record_step_metrics(
            run_id=run_id, script_name=SCRIPT,
            rows_ingested=len(rows), rows_upserted=count,
            rows_dead_lettered=0, duration_seconds=round(duration, 1),
        )
        log_run_end(run_id, "success", rows_processed=count)
        log.info("compute_pac_leaderboard_complete", rows=count)

    except Exception as e:
        log.error("compute_pac_leaderboard_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        raise


if __name__ == "__main__":
    main()
