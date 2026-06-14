"""Compute legislator top contributors from FEC tables.

Pre-computes derived.legislator_top_contributors by joining unnested fec_ids
from congress.legislators with fec.pac_to_candidate and fec.independent_expenditures,
grouping by connected org (or cmte_name), and keeping the top 10 per legislator.

Usage: uv run python -m scripts.compute_legislator_top_contributors
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

SCRIPT = "compute_legislator_top_contributors"

_SQL = """
WITH legislator_fec AS (
    SELECT bioguide_id, unnest(fec_ids) AS cand_id
    FROM congress.legislators
),
direct_by_cand AS (
    SELECT lf.bioguide_id, p.cmte_id,
           SUM(p.transaction_amt) AS direct_total
    FROM fec.pac_to_candidate p
    JOIN legislator_fec lf ON p.cand_id = lf.cand_id
    GROUP BY lf.bioguide_id, p.cmte_id
),
ie_by_cand AS (
    SELECT lf.bioguide_id, ie.cmte_id,
           SUM(CASE WHEN ie.sup_opp = 'S' THEN ie.transaction_amt ELSE 0 END) AS ie_for_total
    FROM fec.independent_expenditures ie
    JOIN legislator_fec lf ON ie.cand_id = lf.cand_id
    GROUP BY lf.bioguide_id, ie.cmte_id
),
combined AS (
    SELECT
        COALESCE(d.bioguide_id, ie.bioguide_id) AS bioguide_id,
        COALESCE(d.cmte_id, ie.cmte_id) AS cmte_id,
        COALESCE(d.direct_total, 0) AS direct,
        COALESCE(ie.ie_for_total, 0) AS ie_for,
        COALESCE(d.direct_total, 0) + COALESCE(ie.ie_for_total, 0) AS total
    FROM direct_by_cand d
    FULL OUTER JOIN ie_by_cand ie
        ON d.bioguide_id = ie.bioguide_id AND d.cmte_id = ie.cmte_id
),
with_names AS (
    SELECT
        c.bioguide_id,
        c.cmte_id,
        COALESCE(NULLIF(cn.connected_org, ''), cn.cmte_name) AS org_name,
        c.direct,
        c.ie_for,
        c.total
    FROM combined c
    LEFT JOIN fec.cmte_names cn ON cn.cmte_id = c.cmte_id
    WHERE c.total > 0
),
ranked AS (
    SELECT
        bioguide_id,
        cmte_id,
        org_name,
        direct,
        ie_for,
        total,
        RANK() OVER (PARTITION BY bioguide_id ORDER BY total DESC) AS rank
    FROM with_names
)
SELECT bioguide_id, cmte_id, org_name, direct, ie_for, total, rank
FROM ranked
WHERE rank <= 10
ORDER BY bioguide_id, rank
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

        log.info("executing_legislator_top_contributors_query")
        cur.execute(_SQL)
        rows = cur.fetchall()
        cols = [desc[0] for desc in cur.description]
        log.info("legislator_top_contributors_rows_fetched", count=len(rows))

        cur.execute("DELETE FROM derived.legislator_top_contributors")
        log.info("legislator_top_contributors_cleared")

        records = []
        for row in rows:
            r = dict(zip(cols, row))
            records.append({
                "bioguide_id": r["bioguide_id"],
                "cmte_id": r["cmte_id"],
                "org_name": r.get("org_name"),
                "direct": float(r.get("direct") or 0),
                "ie_for": float(r.get("ie_for") or 0),
                "total": float(r.get("total") or 0),
                "rank": int(r["rank"]),
                "cycle": cycle,
            })

        count = upsert("legislator_top_contributors", records,
                       on_conflict="bioguide_id,cmte_id", schema="derived")
        log.info("legislator_top_contributors_upserted", count=count)

        conn.close()
        record_freshness("derived", "legislator_top_contributors", rows_affected=count, run_id=run_id)
        duration = time.monotonic() - start_time
        record_step_metrics(
            run_id=run_id, script_name=SCRIPT,
            rows_ingested=len(rows), rows_upserted=count,
            rows_dead_lettered=0, duration_seconds=round(duration, 1),
        )
        log_run_end(run_id, "success", rows_processed=count)
        log.info("compute_legislator_top_contributors_complete", rows=count)

    except Exception as e:
        log.error("compute_legislator_top_contributors_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        raise


if __name__ == "__main__":
    main()
