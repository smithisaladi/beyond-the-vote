"""Run donor entity resolution.

Usage: cd pipeline && uv run python -m scripts.enrich_donors [--cycles 2024,2026]
"""
import argparse
import sys
from pathlib import Path

import structlog

from shared.observability import configure_logging, configure_sentry
from shared.db import log_run_start, log_run_end
from enrich.donor_resolution import run_donor_resolution

SCRIPT = "enrich_donors"
DATA_DIR = Path(__file__).parent.parent / "data"
log = structlog.get_logger()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cycles", type=str, default="2024,2026")
    args = parser.parse_args()
    cycles = [int(c) for c in args.cycles.split(",")]

    configure_logging(service="pipeline")
    configure_sentry(service="pipeline")

    run_id = log_run_start(SCRIPT)

    try:
        indiv_parquets = []
        for cycle in cycles:
            path = DATA_DIR / "fec" / str(cycle) / "indiv.parquet"
            if path.exists():
                indiv_parquets.append(path)
            else:
                log.warning("indiv_parquet_missing", cycle=cycle, path=str(path))

        if not indiv_parquets:
            log.warning("no_parquets_found")
            log_run_end(run_id, "success", rows_processed=0)
            return

        total = run_donor_resolution(indiv_parquets)
        log_run_end(run_id, "success", rows_processed=total)
        log.info("enrich_donors_complete", total=total)

    except Exception as e:
        log.error("enrich_donors_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
