# pipeline/scripts/ingest_all.py
"""Run full pipeline: ingest all data sources and load to Supabase.
Usage: uv run python -m pipeline.scripts.ingest_all [--congress 119] [--cycles 2024,2026]
"""
import argparse
import sys
from pathlib import Path

import structlog

from shared.observability import configure_logging, configure_sentry
from shared.db import log_run_start, log_run_end
from ingest import congress, legislators, fec, voteview
from load.bills import load_bills
from load.legislators import load_legislators, load_committees, load_committee_memberships
from load.votes import load_votes
from load.fec import load_pac_contributions, load_ie_contributions, load_committee_names
from load.scores import load_scores
from load.embeddings import load_bill_embeddings

SCRIPT = "ingest_all"
DATA_DIR = Path(__file__).parent.parent / "data"

log = structlog.get_logger()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--congress", type=int, nargs="+", default=[118, 119])
    parser.add_argument("--cycles", type=str, default="2024,2026")
    parser.add_argument("--skip-congress", action="store_true")
    parser.add_argument("--skip-fec", action="store_true")
    parser.add_argument("--skip-embeddings", action="store_true")
    args = parser.parse_args()

    cycles = [int(c) for c in args.cycles.split(",")]

    configure_logging(service="pipeline")
    configure_sentry(service="pipeline")

    run_id = log_run_start(SCRIPT)
    total_rows = 0

    try:
        # 1. Legislators (always first — other tables reference them)
        log.info("stage_legislators")
        repo_dir = legislators.sync(DATA_DIR)
        current = legislators.load_current(repo_dir)
        historical = legislators.load_historical(repo_dir)
        total_rows += load_legislators(current, historical)

        committees_raw = legislators.load_committees(repo_dir)
        load_committees(committees_raw)

        memberships = legislators.load_committee_memberships(repo_dir)
        load_committee_memberships(memberships)

        # Build ICPSR -> bioguide lookup for VoteView
        icpsr_to_bioguide = {}
        for record in current + historical:
            ids = record.get("id", {})
            if ids.get("bioguide") and ids.get("icpsr"):
                icpsr_to_bioguide[str(ids["icpsr"])] = ids["bioguide"]

        # 2. VoteView scores
        log.info("stage_voteview")
        csv_path = voteview.download_scores(DATA_DIR)
        scores = voteview.parse_scores(csv_path)
        total_rows += load_scores(scores, icpsr_to_bioguide)

        # 3. Congress data (bills + votes)
        if not args.skip_congress:
            repo = congress.setup(DATA_DIR)
            for c in args.congress:
                log.info("stage_congress", congress=c)
                congress.run_bills(repo, c)
                congress.run_votes(repo, c)

                bill_jsons = list(congress.iter_bill_jsons(repo, c))
                total_rows += load_bills(bill_jsons)

                vote_jsons = list(congress.iter_vote_jsons(repo, c))
                s, p = load_votes(vote_jsons)
                total_rows += s + p

        # 4. FEC data
        if not args.skip_fec:
            for cycle in cycles:
                log.info("stage_fec", cycle=cycle)
                paths = fec.download_and_convert_cycle(cycle, DATA_DIR)
                total_rows += load_pac_contributions(paths["pas2"], cycle)
                total_rows += load_ie_contributions(paths["pas2"], cycle)
                total_rows += load_committee_names(paths["cm"])

        # 5. Bill embeddings
        if not args.skip_embeddings:
            log.info("stage_embeddings")
            total_rows += load_bill_embeddings()

        log_run_end(run_id, "success", rows_processed=total_rows)
        log.info("pipeline_complete", total_rows=total_rows)

    except Exception as e:
        log.error("pipeline_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
