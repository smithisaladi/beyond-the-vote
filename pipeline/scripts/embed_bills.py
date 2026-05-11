"""Generate/update bill embeddings for semantic search.
Usage: uv run python -m pipeline.scripts.embed_bills
"""
import sys
from pipeline.shared.observability import configure_logging, configure_sentry
from pipeline.shared.db import log_run_start, log_run_end
from pipeline.load.embeddings import load_bill_embeddings

SCRIPT = "embed_bills"


def main() -> None:
    configure_logging(service="pipeline")
    configure_sentry(service="pipeline")
    run_id = log_run_start(SCRIPT)
    try:
        total = load_bill_embeddings()
        log_run_end(run_id, "success", rows_processed=total)
    except Exception as e:
        log_run_end(run_id, "failed", error_detail=str(e))
        raise


if __name__ == "__main__":
    main()
