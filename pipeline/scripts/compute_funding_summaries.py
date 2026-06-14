"""Compute legislator funding summaries from FEC bulk files via DuckDB.

Populates derived.legislator_funding_summary with:
- pac_direct_total: PAC contributions to candidate
- large_donor_total: Itemized individual contributions (>$200)
- small_donor_total: ttl_indiv_contrib minus large_donor_total
- superpac_ie_for / superpac_ie_against: Independent expenditures
- in_state_total / out_of_state_total: Geographic breakdown of individual contributions

Usage: cd pipeline && uv run python -m scripts.compute_funding_summaries
"""
import sys
import time

from dotenv import load_dotenv
load_dotenv()

from shared.observability import configure_logging
from shared.db import get_conn, log_run_start, log_run_end
from shared.freshness import record_freshness
from shared.metrics import record_step_metrics

import structlog
configure_logging(service="pipeline", debug=True)
log = structlog.get_logger()

from config import DATA_PROCESSED_FEC, FEC_CYCLES, CCL_COLS, INDIV_CSV_COLS, CAND_SUMMARY_CSV_COLS


def main():
    run_id = log_run_start("compute_funding_summaries")
    start_time = time.monotonic()
    try:
        import duckdb

        conn = get_conn()
        cur = conn.cursor()

        # Load legislator fec_ids mapping
        cur.execute("SELECT bioguide_id, unnest(fec_ids) as cand_id, state FROM congress.legislators")
        leg_rows = cur.fetchall()
        bioguide_map = {}  # cand_id -> (bioguide_id, state)
        for bioguide_id, cand_id, state in leg_rows:
            bioguide_map[cand_id] = (bioguide_id, state)
        log.info("loaded_legislator_fec_ids", count=len(bioguide_map))

        db = duckdb.connect(":memory:")

        # Load committee master to get cmte_id -> cand_id linkage (principal committees)
        committees_path = DATA_PROCESSED_FEC / "committees.csv"
        db.execute(f"""
            CREATE TABLE committees AS
            SELECT cmte_id, cand_id
            FROM read_csv('{committees_path}', delim='|', header=true, all_varchar=true, ignore_errors=true)
            WHERE cand_id IS NOT NULL AND cand_id != ''
        """)
        log.info("loaded_committees")

        results: dict[str, dict] = {}  # bioguide_id -> summary

        for cycle in FEC_CYCLES:
            log.info("processing_cycle", cycle=cycle)

            # 1. Candidate financial summaries (for total individual contributions)
            cand_summary_path = DATA_PROCESSED_FEC / f"candidate_summaries_{cycle}.csv"
            if cand_summary_path.exists():
                cand_summaries = db.execute(f"""
                    SELECT cand_id,
                           TRY_CAST(ttl_indiv_contrib AS DOUBLE) as ttl_indiv,
                           TRY_CAST(other_pol_cmte_contrib AS DOUBLE) as pac_from_summary
                    FROM read_csv('{cand_summary_path}', delim='|', header=true, all_varchar=true, ignore_errors=true)
                    WHERE cand_id IS NOT NULL
                """).fetchall()
                cand_totals = {row[0]: {"ttl_indiv": row[1] or 0, "pac_summary": row[2] or 0}
                               for row in cand_summaries}
                log.info("loaded_candidate_summaries", cycle=cycle, count=len(cand_totals))
            else:
                cand_totals = {}
                log.warning("no_candidate_summaries", cycle=cycle)

            # 2. Large individual contributions (itemized, >$200) grouped by candidate
            indiv_path = DATA_PROCESSED_FEC / f"individual_contributions_{cycle}.csv"
            if indiv_path.exists():
                start = time.time()
                large_indiv = db.execute(f"""
                    SELECT c.cand_id,
                           SUM(TRY_CAST(i.transaction_amt AS DOUBLE)) as large_total
                    FROM read_csv('{indiv_path}', delim='|', header=true, all_varchar=true, ignore_errors=true) i
                    JOIN committees c ON i.cmte_id = c.cmte_id
                    WHERE TRY_CAST(i.transaction_amt AS DOUBLE) > 0
                    GROUP BY c.cand_id
                """).fetchall()
                large_by_cand = {row[0]: row[1] or 0 for row in large_indiv}
                log.info("computed_large_individual", cycle=cycle, candidates=len(large_by_cand),
                         elapsed_s=round(time.time() - start, 1))

                # 3. Geographic breakdown: in-state vs out-of-state
                start = time.time()
                geo_rows = db.execute(f"""
                    SELECT c.cand_id, i.state as donor_state,
                           SUM(TRY_CAST(i.transaction_amt AS DOUBLE)) as total
                    FROM read_csv('{indiv_path}', delim='|', header=true, all_varchar=true, ignore_errors=true) i
                    JOIN committees c ON i.cmte_id = c.cmte_id
                    WHERE TRY_CAST(i.transaction_amt AS DOUBLE) > 0
                    GROUP BY c.cand_id, i.state
                """).fetchall()
                geo_by_cand: dict[str, dict] = {}
                for cand_id, donor_state, total in geo_rows:
                    if cand_id not in geo_by_cand:
                        geo_by_cand[cand_id] = {"in_state": 0, "out_of_state": 0}
                    _, leg_state = bioguide_map.get(cand_id, (None, None))
                    if leg_state and donor_state and donor_state.upper() == leg_state.upper():
                        geo_by_cand[cand_id]["in_state"] += total or 0
                    else:
                        geo_by_cand[cand_id]["out_of_state"] += total or 0
                log.info("computed_geographic", cycle=cycle, elapsed_s=round(time.time() - start, 1))
            else:
                large_by_cand = {}
                geo_by_cand = {}
                log.warning("no_individual_contributions", cycle=cycle)

            # 4. PAC direct contributions (already in DB, but compute from bulk for consistency)
            pac_path = DATA_PROCESSED_FEC / f"pac_to_candidate_{cycle}.csv"
            if pac_path.exists():
                pac_rows = db.execute(f"""
                    SELECT cand_id, SUM(TRY_CAST(transaction_amt AS DOUBLE)) as pac_total
                    FROM read_csv('{pac_path}', delim='|', header=true, all_varchar=true, ignore_errors=true)
                    WHERE TRY_CAST(transaction_amt AS DOUBLE) > 0
                    GROUP BY cand_id
                """).fetchall()
                pac_by_cand = {row[0]: row[1] or 0 for row in pac_rows}
            else:
                pac_by_cand = {}

            # 5. IE from DB (already loaded)
            ie_by_cand: dict[str, dict] = {}
            cur.execute("""
                SELECT cand_id,
                       SUM(CASE WHEN sup_opp = 'S' THEN transaction_amt ELSE 0 END) as ie_for,
                       SUM(CASE WHEN sup_opp = 'O' THEN transaction_amt ELSE 0 END) as ie_against
                FROM fec.independent_expenditures
                WHERE cycle = %s
                GROUP BY cand_id
            """, (cycle,))
            for row in cur.fetchall():
                ie_by_cand[row[0]] = {"ie_for": float(row[1] or 0), "ie_against": float(row[2] or 0)}

            # 6. Assemble per-legislator results
            for cand_id, (bioguide_id, state) in bioguide_map.items():
                if bioguide_id not in results:
                    results[bioguide_id] = {
                        "pac_direct_total": 0, "large_donor_total": 0, "small_donor_total": 0,
                        "superpac_ie_for": 0, "superpac_ie_against": 0,
                        "in_state_total": 0, "out_of_state_total": 0,
                    }
                r = results[bioguide_id]

                pac = pac_by_cand.get(cand_id, 0)
                large = large_by_cand.get(cand_id, 0)
                ttl_indiv = cand_totals.get(cand_id, {}).get("ttl_indiv", 0)
                small = max(0, ttl_indiv - large)
                ie = ie_by_cand.get(cand_id, {})
                geo = geo_by_cand.get(cand_id, {})

                r["pac_direct_total"] += pac
                r["large_donor_total"] += large
                r["small_donor_total"] += small
                r["superpac_ie_for"] += ie.get("ie_for", 0)
                r["superpac_ie_against"] += ie.get("ie_against", 0)
                r["in_state_total"] += geo.get("in_state", 0)
                r["out_of_state_total"] += geo.get("out_of_state", 0)

        db.close()

        # Upsert to derived.legislator_funding_summary
        rows_to_upsert = []
        for bioguide_id, r in results.items():
            # Skip legislators with no funding data at all
            if all(v == 0 for v in r.values()):
                continue
            rows_to_upsert.append({
                "bioguide_id": bioguide_id,
                "cycle": max(FEC_CYCLES),
                "pac_direct_total": round(r["pac_direct_total"], 2),
                "large_donor_total": round(r["large_donor_total"], 2),
                "small_donor_total": round(r["small_donor_total"], 2),
                "superpac_ie_for": round(r["superpac_ie_for"], 2),
                "superpac_ie_against": round(r["superpac_ie_against"], 2),
                "in_state_total": round(r["in_state_total"], 2),
                "out_of_state_total": round(r["out_of_state_total"], 2),
            })

        from shared.db import upsert
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
