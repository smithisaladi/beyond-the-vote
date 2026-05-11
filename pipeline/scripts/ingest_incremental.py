# pipeline/scripts/ingest_incremental.py
"""Incremental pipeline sync — only fetches data updated since last run.
Usage: uv run python -m pipeline.scripts.ingest_incremental
"""
import sys
from pathlib import Path

import structlog

from pipeline.shared.observability import configure_logging, configure_sentry
from pipeline.shared.db import log_run_start, log_run_end
from pipeline.ingest import congress, legislators, voteview
from pipeline.load.bills import load_bills
from pipeline.load.legislators import load_legislators, load_committee_memberships
from pipeline.load.votes import load_votes
from pipeline.load.scores import load_scores
from pipeline.load.embeddings import load_bill_embeddings

SCRIPT = "ingest_incremental"
DATA_DIR = Path(__file__).parent.parent / "data"
CONGRESSES = [119]

log = structlog.get_logger()


def main() -> None:
    configure_logging(service="pipeline")
    configure_sentry(service="pipeline")

    run_id = log_run_start(SCRIPT)
    total_rows = 0

    try:
        # 1. Legislators
        repo_dir = legislators.sync(DATA_DIR)
        current = legislators.load_current(repo_dir)
        historical = legislators.load_historical(repo_dir)
        total_rows += load_legislators(current, historical)

        memberships = legislators.load_committee_memberships(repo_dir)
        load_committee_memberships(memberships)

        icpsr_to_bioguide = {}
        for record in current + historical:
            ids = record.get("id", {})
            if ids.get("bioguide") and ids.get("icpsr"):
                icpsr_to_bioguide[str(ids["icpsr"])] = ids["bioguide"]

        # 2. VoteView
        csv_path = voteview.download_scores(DATA_DIR)
        scores = voteview.parse_scores(csv_path)
        total_rows += load_scores(scores, icpsr_to_bioguide)

        # 3. Congress (current congress only, usc-run handles caching)
        repo = congress.setup(DATA_DIR)
        for c in CONGRESSES:
            congress.run_bills(repo, c)
            congress.run_votes(repo, c)

            bill_jsons = list(congress.iter_bill_jsons(repo, c))
            total_rows += load_bills(bill_jsons)

            vote_jsons = list(congress.iter_vote_jsons(repo, c))
            s, p = load_votes(vote_jsons)
            total_rows += s + p

        # 4. Embed any new bills
        total_rows += load_bill_embeddings()

        log_run_end(run_id, "success", rows_processed=total_rows)
        log.info("incremental_sync_complete", total_rows=total_rows)

    except Exception as e:
        log.error("incremental_sync_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
