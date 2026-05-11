"""Run all Tier 3 anomaly detection enrichments.

Usage: cd pipeline && uv run python -m scripts.enrich_tier3 [--cycles 2024,2026]
"""
import argparse
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from shared.observability import configure_logging, configure_sentry
from shared.db import log_run_start, log_run_end

import structlog
configure_logging(service="pipeline", debug=True)
log = structlog.get_logger()

SCRIPT = "enrich_tier3"
DATA_DIR = Path(__file__).parent.parent / "data"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cycles", type=str, default="2024,2026")
    parser.add_argument("--skip-suspicious", action="store_true")
    parser.add_argument("--skip-change-detection", action="store_true")
    args = parser.parse_args()

    cycles = [int(c) for c in args.cycles.split(",")]

    run_id = log_run_start(SCRIPT)
    total = 0

    try:
        for cycle in cycles:
            indiv_parquet = DATA_DIR / "fec" / str(cycle) / "indiv.parquet"
            pas2_parquet = DATA_DIR / "fec" / str(cycle) / "pas2.parquet"

            if not args.skip_suspicious and indiv_parquet.exists():
                log.info("suspicious_clusters_starting", cycle=cycle)
                start = time.time()
                from enrich.suspicious_clusters import run_suspicious_clusters
                count = run_suspicious_clusters(indiv_parquet)
                total += count
                log.info("suspicious_clusters_done", cycle=cycle, count=count,
                         elapsed_s=round(time.time() - start, 1))

            if not args.skip_change_detection and pas2_parquet.exists():
                log.info("change_detection_starting", cycle=cycle)
                start = time.time()
                from enrich.change_detection import run_change_detection
                count = run_change_detection(pas2_parquet)
                total += count
                log.info("change_detection_done", cycle=cycle, count=count,
                         elapsed_s=round(time.time() - start, 1))

        log_run_end(run_id, "success", rows_processed=total)
        log.info("tier3_complete", total=total)

    except Exception as e:
        log.error("tier3_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
