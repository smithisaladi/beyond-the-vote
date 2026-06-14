"""Generate/update bill embeddings for semantic search.
Usage: uv run python -m pipeline.scripts.embed_bills
"""
import sys
import time
from shared.observability import configure_logging, configure_sentry
from shared.db import log_run_start, log_run_end
from shared.freshness import record_freshness
from shared.metrics import record_step_metrics
from load.embeddings import load_bill_embeddings

SCRIPT = "embed_bills"


def main() -> None:
    configure_logging(service="pipeline")
    configure_sentry(service="pipeline")
    run_id = log_run_start(SCRIPT)
    start_time = time.monotonic()
    try:
        total = load_bill_embeddings()
        record_freshness("enrichment", "bill_embeddings", rows_affected=total, run_id=run_id)
        duration = time.monotonic() - start_time
        record_step_metrics(
            run_id=run_id, script_name=SCRIPT,
            rows_ingested=total, rows_upserted=total,
            rows_dead_lettered=0, duration_seconds=round(duration, 1),
        )
        log_run_end(run_id, "success", rows_processed=total)
    except Exception as e:
        log_run_end(run_id, "failed", error_detail=str(e))
        raise


if __name__ == "__main__":
    main()
