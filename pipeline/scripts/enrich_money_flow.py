"""Run money flow tracing (PAC chains + individual→PAC edges).

Usage: cd pipeline && uv run python -m scripts.enrich_money_flow [--cycles 2024,2026]
"""
import argparse
import sys
import time
from pathlib import Path

import structlog

from shared.observability import configure_logging, configure_sentry
from shared.db import log_run_start, log_run_end
from shared.freshness import record_freshness
from shared.metrics import record_step_metrics
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
    start_time = time.monotonic()
    total = 0

    try:
        for cycle in cycles:
            pas2_parquet = DATA_DIR / "fec" / str(cycle) / "pas2.parquet"
            if pas2_parquet.exists():
                log.info("money_flow_starting", cycle=cycle)
                total += run_money_flow(pas2_parquet, cycle)
            else:
                log.warning("pas2_parquet_missing", cycle=cycle, path=str(pas2_parquet))

        record_freshness("analytics", "money_flow_attribution", rows_affected=total, run_id=run_id)
        duration = time.monotonic() - start_time
        record_step_metrics(
            run_id=run_id, script_name=SCRIPT,
            rows_ingested=total, rows_upserted=total,
            rows_dead_lettered=0, duration_seconds=round(duration, 1),
        )
        log_run_end(run_id, "success", rows_processed=total)
        log.info("enrich_money_flow_complete", total=total)

    except Exception as e:
        log.error("enrich_money_flow_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
