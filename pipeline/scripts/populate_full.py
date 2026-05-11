"""Full database population — requires Supabase Pro (8GB storage).

Runs everything that populate_db.py skips: donor resolution, address standardization,
and employer normalization on both FEC cycles.

Usage: cd pipeline && uv run python -m scripts.populate_full
"""
import sys
import time
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
load_dotenv()

from shared.observability import configure_logging
from shared.db import log_run_start, log_run_end

import structlog
configure_logging(service="pipeline", debug=True)
log = structlog.get_logger()

DATA_DIR = Path(__file__).parent.parent / "data"
FEC_CYCLES = [2024, 2026]


def get_storage_mb() -> float:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("""SELECT COALESCE(SUM(pg_total_relation_size(schemaname || '.' || tablename)), 0)
        FROM pg_tables WHERE schemaname IN ('congress','fec','enrichment','analytics','anomalies','app','derived','ops')""")
    mb = cur.fetchone()[0] / 1024 / 1024
    conn.close()
    return mb


def main():
    run_id = log_run_start("populate_full")
    log.info("populate_full_starting", storage_mb=round(get_storage_mb(), 1))

    try:
        # --- Donor resolution (both cycles) ---
        for cycle in FEC_CYCLES:
            indiv = DATA_DIR / "fec" / str(cycle) / "indiv.parquet"
            if not indiv.exists():
                log.warning("indiv_parquet_missing", cycle=cycle)
                continue

            log.info("donor_resolution_starting", cycle=cycle)
            start = time.time()
            from enrich.donor_resolution import run_donor_resolution
            count = run_donor_resolution(indiv)
            elapsed = time.time() - start
            log.info("donor_resolution_done", cycle=cycle, rows=count,
                     elapsed_min=round(elapsed / 60, 1), storage_mb=round(get_storage_mb(), 1))

        # --- Employer normalization (2024 cycle — 2026 already done) ---
        indiv_2024 = DATA_DIR / "fec" / "2024" / "indiv.parquet"
        if indiv_2024.exists():
            log.info("employer_normalization_starting", cycle=2024)
            start = time.time()
            from enrich.employer_normalization import run_employer_normalization
            count = run_employer_normalization(indiv_2024)
            elapsed = time.time() - start
            log.info("employer_normalization_done", cycle=2024, rows=count,
                     elapsed_min=round(elapsed / 60, 1), storage_mb=round(get_storage_mb(), 1))

        # --- Industry classification (re-run to cover new employers) ---
        log.info("industry_classification_starting")
        from enrich.industry_classification import run_industry_classification
        count = run_industry_classification(use_llm=False)
        log.info("industry_classification_done", rows=count)

        # --- Address standardization (both cycles, no geocoding to save time) ---
        for cycle in FEC_CYCLES:
            indiv = DATA_DIR / "fec" / str(cycle) / "indiv.parquet"
            if not indiv.exists():
                continue

            log.info("address_standardization_starting", cycle=cycle)
            start = time.time()
            from enrich.address_standardization import run_address_standardization
            count = run_address_standardization(indiv, geocode=False)
            elapsed = time.time() - start
            log.info("address_standardization_done", cycle=cycle, rows=count,
                     elapsed_min=round(elapsed / 60, 1), storage_mb=round(get_storage_mb(), 1))

        final_mb = get_storage_mb()
        log_run_end(run_id, "success", metadata={"storage_mb": round(final_mb, 1)})
        log.info("populate_full_complete", storage_mb=round(final_mb, 1))

    except Exception as e:
        log.error("populate_full_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        log.info("storage_at_failure", storage_mb=round(get_storage_mb(), 1))
        sys.exit(1)


if __name__ == "__main__":
    main()
