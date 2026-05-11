# pipeline/scripts/enrich_tier2.py
"""Run all Tier 2 ML enrichments.
Usage: uv run python -m pipeline.scripts.enrich_tier2 [--cycles 2024,2026]
"""
import argparse
import sys
from pathlib import Path
import structlog
from pipeline.shared.observability import configure_logging, configure_sentry
from pipeline.shared.db import log_run_start, log_run_end
from pipeline.enrich.donor_clustering import run_donor_clustering
from pipeline.enrich.money_flow import run_money_flow

SCRIPT = "enrich_tier2"
DATA_DIR = Path(__file__).parent.parent / "data"
log = structlog.get_logger()

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cycles", type=str, default="2024,2026")
    parser.add_argument("--skip-clustering", action="store_true")
    parser.add_argument("--skip-money-flow", action="store_true")
    args = parser.parse_args()
    cycles = [int(c) for c in args.cycles.split(",")]
    configure_logging(service="pipeline")
    configure_sentry(service="pipeline")
    run_id = log_run_start(SCRIPT)
    total_rows = 0
    try:
        for cycle in cycles:
            indiv_parquet = DATA_DIR / "fec" / str(cycle) / "indiv.parquet"
            pas2_parquet = DATA_DIR / "fec" / str(cycle) / "pas2.parquet"
            if not args.skip_clustering and indiv_parquet.exists():
                log.info("stage_donor_clustering", cycle=cycle)
                total_rows += run_donor_clustering(indiv_parquet)
            if not args.skip_money_flow and pas2_parquet.exists():
                log.info("stage_money_flow", cycle=cycle)
                total_rows += run_money_flow(pas2_parquet, cycle)
        log_run_end(run_id, "success", rows_processed=total_rows)
        log.info("tier2_complete", total_rows=total_rows)
    except Exception as e:
        log.error("tier2_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
