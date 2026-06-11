"""Run money flow tracing (PAC chains + individual→PAC edges).

Usage: cd pipeline && uv run python -m scripts.enrich_money_flow [--cycles 2024,2026]
"""
import argparse
import sys
from pathlib import Path

import structlog

from shared.observability import configure_logging, configure_sentry
from shared.db import log_run_start, log_run_end
from enrich.money_flow import run_money_flow

SCRIPT = "enrich_money_flow"
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
    total = 0

    try:
        for cycle in cycles:
            pas2_parquet = DATA_DIR / "fec" / str(cycle) / "pas2.parquet"
            if pas2_parquet.exists():
                log.info("money_flow_starting", cycle=cycle)
                total += run_money_flow(pas2_parquet, cycle)
            else:
                log.warning("pas2_parquet_missing", cycle=cycle, path=str(pas2_parquet))

        log_run_end(run_id, "success", rows_processed=total)
        log.info("enrich_money_flow_complete", total=total)

    except Exception as e:
        log.error("enrich_money_flow_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
