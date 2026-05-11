"""Run all Tier 1 ML enrichments.

Usage:
    uv run python -m pipeline.scripts.enrich_tier1 [--cycles 2024,2026] [--skip-geocode] [--use-llm]
"""
import argparse
import sys
from pathlib import Path

import structlog

from pipeline.shared.observability import configure_logging, configure_sentry
from pipeline.shared.db import log_run_start, log_run_end
from pipeline.enrich.donor_resolution import run_donor_resolution
from pipeline.enrich.employer_normalization import run_employer_normalization
from pipeline.enrich.industry_classification import run_industry_classification
from pipeline.enrich.address_standardization import run_address_standardization

SCRIPT = "enrich_tier1"
DATA_DIR = Path(__file__).parent.parent / "data"

log = structlog.get_logger()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cycles", type=str, default="2024,2026")
    parser.add_argument("--skip-geocode", action="store_true",
                        help="Skip Census geocoding (faster, no lat/lon)")
    parser.add_argument("--use-llm", action="store_true",
                        help="Use Anthropic API for industry classification instead of local embeddings")
    parser.add_argument("--skip-donor-resolution", action="store_true")
    parser.add_argument("--skip-employer-normalization", action="store_true")
    parser.add_argument("--skip-industry-classification", action="store_true")
    parser.add_argument("--skip-address-standardization", action="store_true")
    args = parser.parse_args()

    cycles = [int(c) for c in args.cycles.split(",")]

    configure_logging(service="pipeline")
    configure_sentry(service="pipeline")

    run_id = log_run_start(SCRIPT)
    total_rows = 0

    try:
        for cycle in cycles:
            indiv_parquet = DATA_DIR / "fec" / str(cycle) / "indiv.parquet"
            if not indiv_parquet.exists():
                log.warning("indiv_parquet_missing", cycle=cycle, path=str(indiv_parquet))
                continue

            log.info("processing_cycle", cycle=cycle)

            # 1a. Donor entity resolution
            if not args.skip_donor_resolution:
                log.info("stage_donor_resolution", cycle=cycle)
                total_rows += run_donor_resolution(indiv_parquet)

            # 1b. Employer normalization
            if not args.skip_employer_normalization:
                log.info("stage_employer_normalization", cycle=cycle)
                total_rows += run_employer_normalization(indiv_parquet)

            # 1d. Address standardization
            if not args.skip_address_standardization:
                log.info("stage_address_standardization", cycle=cycle)
                total_rows += run_address_standardization(
                    indiv_parquet, geocode=not args.skip_geocode
                )

        # 1c. Industry classification (runs once across all employers, not per cycle)
        if not args.skip_industry_classification:
            log.info("stage_industry_classification")
            total_rows += run_industry_classification(use_llm=args.use_llm)

        log_run_end(run_id, "success", rows_processed=total_rows)
        log.info("tier1_complete", total_rows=total_rows)

    except Exception as e:
        log.error("tier1_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
