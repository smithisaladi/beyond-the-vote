"""Compute the in-state vs out-of-state geographic split of itemized individual
contributions per legislator, from FEC bulk parquet via DuckDB.

Populates ONLY derived.legislator_funding_summary.in_state_total /
out_of_state_total. The dollar totals (pac_direct_total, large/small_donor_total,
superpac_ie_*) are owned by the OpenFEC API path in scripts.sync_weekly
(sync_funding_summaries); this script partial-upserts just the two geographic
columns, so it never clobbers those API-computed values.

The geographic breakdown needs the bulk individual-contribution file, which is
only present when the FEC parquet cache is warm (produced by the donor-resolution
workflow). When the parquet is absent this script is a clean no-op.

Usage: cd pipeline && uv run python -m scripts.compute_funding_summaries
"""
import time
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from shared.observability import configure_logging
from shared.db import get_conn, log_run_start, log_run_end, upsert
from shared.freshness import record_freshness
from shared.metrics import record_step_metrics

import structlog
configure_logging(service="pipeline", debug=True)
log = structlog.get_logger()

from config import FEC_CYCLES

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def main():
    run_id = log_run_start("compute_funding_summaries")
    start_time = time.monotonic()
    try:
        import duckdb

        conn = get_conn()
        cur = conn.cursor()

        # Map FEC candidate id -> (bioguide_id, legislator home state)
        cur.execute("SELECT bioguide_id, unnest(fec_ids) as cand_id, state FROM congress.legislators")
        bioguide_map: dict[str, tuple[str, str]] = {}
        for bioguide_id, cand_id, state in cur.fetchall():
            bioguide_map[cand_id] = (bioguide_id, state)
        log.info("loaded_legislator_fec_ids", count=len(bioguide_map))

        db = duckdb.connect(":memory:")
        results: dict[str, dict] = {}  # bioguide_id -> {in_state_total, out_of_state_total}

        for cycle in FEC_CYCLES:
            cm_path = DATA_DIR / "fec" / str(cycle) / "cm.parquet"
            indiv_path = DATA_DIR / "fec" / str(cycle) / "indiv.parquet"
            # Geo breakdown needs the bulk individual-contribution file; only
            # present when the FEC parquet cache is warm. Skip the cycle if absent.
            if not cm_path.exists() or not indiv_path.exists():
                log.warning("fec_parquet_missing", cycle=cycle,
                            cm=str(cm_path), indiv=str(indiv_path))
                continue

            log.info("processing_cycle", cycle=cycle)
            start = time.time()
            # Join individual contributions to their committee's candidate, then
            # bucket each donor's giving by donor state for later in/out comparison.
            geo_rows = db.execute(f"""
                SELECT c.cand_id, i.state AS donor_state,
                       SUM(TRY_CAST(i.transaction_amt AS DOUBLE)) AS total
                FROM read_parquet('{indiv_path}') i
                JOIN read_parquet('{cm_path}') c ON i.cmte_id = c.cmte_id
                WHERE TRY_CAST(i.transaction_amt AS DOUBLE) > 0
                  AND c.cand_id IS NOT NULL AND c.cand_id != ''
                GROUP BY c.cand_id, i.state
            """).fetchall()

            for cand_id, donor_state, total in geo_rows:
                entry = bioguide_map.get(cand_id)
                if not entry:
                    continue
                bioguide_id, leg_state = entry
                r = results.setdefault(bioguide_id, {"in_state_total": 0.0, "out_of_state_total": 0.0})
                if leg_state and donor_state and donor_state.upper() == leg_state.upper():
                    r["in_state_total"] += total or 0
                else:
                    r["out_of_state_total"] += total or 0
            log.info("computed_geographic", cycle=cycle,
                     rows=len(geo_rows), elapsed_s=round(time.time() - start, 1))

        db.close()

        # Partial upsert — only the geographic columns. The on_conflict UPDATE
        # touches just these (see shared.db.upsert), leaving the API-computed
        # dollar totals on the existing row intact.
        rows_to_upsert = [
            {
                "bioguide_id": bioguide_id,
                "cycle": max(FEC_CYCLES),
                "in_state_total": round(r["in_state_total"], 2),
                "out_of_state_total": round(r["out_of_state_total"], 2),
            }
            for bioguide_id, r in results.items()
            if r["in_state_total"] or r["out_of_state_total"]
        ]

        if not rows_to_upsert:
            log.warning("no_geo_data_computed")
            conn.close()
            duration = time.monotonic() - start_time
            record_step_metrics(
                run_id=run_id, script_name="compute_funding_summaries",
                rows_ingested=0, rows_upserted=0,
                rows_dead_lettered=0, duration_seconds=round(duration, 1),
            )
            log_run_end(run_id, "success", rows_processed=0)
            log.info("compute_funding_summaries_skipped", reason="no_geo_data")
            return

        count = upsert("legislator_funding_summary", rows_to_upsert,
                       on_conflict="bioguide_id,cycle", schema="derived")
        log.info("funding_summaries_upserted", count=count)

        conn.close()
        record_freshness("derived", "legislator_funding_summary", rows_affected=count, run_id=run_id)
        duration = time.monotonic() - start_time
        record_step_metrics(
            run_id=run_id, script_name="compute_funding_summaries",
            rows_ingested=count, rows_upserted=count,
            rows_dead_lettered=0, duration_seconds=round(duration, 1),
        )
        log_run_end(run_id, "success", rows_processed=count)
        log.info("compute_funding_summaries_complete", legislators=count)

    except Exception as e:
        log.error("compute_funding_summaries_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        raise


if __name__ == "__main__":
    main()
