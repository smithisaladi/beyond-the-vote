"""Data freshness tracking — upserts to ops.data_freshness and checks staleness."""
from __future__ import annotations

import structlog

from shared.db import get_conn

log = structlog.get_logger()

# Maps (schema_name, table_name) → max_staleness interval string
STALENESS_THRESHOLDS: dict[tuple[str, str], str] = {
    ("congress", "bills"): "2 days",
    ("congress", "bill_vote_summaries"): "2 days",
    ("fec", "pac_to_candidate"): "8 days",
    ("fec", "independent_expenditures"): "8 days",
    ("enrichment", "donor_canonical"): "15 days",
    ("enrichment", "bill_embeddings"): "2 days",
    ("derived", "pac_top_funders"): "8 days",
    ("derived", "pac_detail_cache"): "8 days",
    ("derived", "pac_leaderboard"): "8 days",
    ("derived", "legislator_top_contributors"): "8 days",
    ("derived", "legislator_funding_summary"): "8 days",
    ("analytics", "money_flow_attribution"): "8 days",
}


def record_freshness(
    schema: str,
    table: str,
    *,
    rows_affected: int = 0,
    run_id: str | None = None,
) -> None:
    """Upsert a freshness record for the given schema.table."""
    max_staleness = STALENESS_THRESHOLDS.get((schema, table), "8 days")
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO ops.data_freshness
            (schema_name, table_name, last_updated, rows_affected, run_id, max_staleness)
        VALUES (%s, %s, now(), %s, %s, %s::interval)
        ON CONFLICT (schema_name, table_name) DO UPDATE SET
            last_updated  = EXCLUDED.last_updated,
            rows_affected = EXCLUDED.rows_affected,
            run_id        = EXCLUDED.run_id,
            max_staleness = EXCLUDED.max_staleness
        """,
        (schema, table, rows_affected, run_id, max_staleness),
    )
    log.info("freshness_recorded", schema=schema, table=table, rows_affected=rows_affected)


def check_staleness() -> list[dict]:
    """Return rows where last_updated + max_staleness < now (i.e. overdue)."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT schema_name, table_name, last_updated, rows_affected, run_id, max_staleness
        FROM ops.data_freshness
        WHERE last_updated + max_staleness < now()
        ORDER BY last_updated ASC
        """
    )
    rows = cur.fetchall()
    results = [
        {
            "schema_name": r[0],
            "table_name": r[1],
            "last_updated": r[2],
            "rows_affected": r[3],
            "run_id": r[4],
            "max_staleness": r[5],
        }
        for r in rows
    ]
    if results:
        log.warning("stale_tables_detected", count=len(results))
    return results


def get_all_freshness() -> list[dict]:
    """Return the full freshness status for all tracked tables."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT schema_name, table_name, last_updated, rows_affected, run_id, max_staleness
        FROM ops.data_freshness
        ORDER BY schema_name, table_name
        """
    )
    rows = cur.fetchall()
    return [
        {
            "schema_name": r[0],
            "table_name": r[1],
            "last_updated": r[2],
            "rows_affected": r[3],
            "run_id": r[4],
            "max_staleness": r[5],
        }
        for r in rows
    ]
