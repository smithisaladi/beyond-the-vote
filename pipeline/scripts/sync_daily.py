"""Daily sync: bills + votes + embeddings for 119th Congress.

Designed to run in GitHub Actions or locally via cron.
usc-run handles incremental fetching (only downloads new/changed files).

Usage: cd pipeline && uv run python -m scripts.sync_daily
"""
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from shared.observability import configure_logging
from shared.db import log_run_start, log_run_end

import structlog
configure_logging(service="pipeline", debug=True)
log = structlog.get_logger()

DATA_DIR = Path(__file__).parent.parent / "data"
CONGRESS = 119


def main():
    run_id = log_run_start("sync_daily")
    total = 0

    try:
        import subprocess
        from ingest.congress import setup
        repo = setup(DATA_DIR)

        # Bills: govinfo incremental + convert
        log.info("syncing_bills")
        start = time.time()
        # 5400s (90 min): a cold cache must download every BILLSTATUS file for the
        # congress in one pass. Incremental runs finish in minutes; this ceiling
        # only matters when seeding/rebuilding the cache. Keep the sum of all
        # subprocess timeouts (govinfo + bills + votes) under the job timeout-minutes.
        subprocess.run(
            [str(repo / "env" / "bin" / "usc-run"), "govinfo",
             "--bulkdata=BILLSTATUS", f"--congress={CONGRESS}", "--log=info"],
            cwd=str(repo), check=True, timeout=5400,
        )
        subprocess.run(
            [str(repo / "env" / "bin" / "usc-run"), "bills",
             f"--congress={CONGRESS}", "--log=info"],
            cwd=str(repo), check=True, timeout=600,
        )

        from ingest.congress import iter_bill_jsons
        from load.bills import load_bills
        bill_jsons = list(iter_bill_jsons(repo, CONGRESS))
        bill_count = load_bills(bill_jsons)
        total += bill_count
        log.info("bills_synced", count=bill_count, elapsed_s=round(time.time() - start, 1))

        # Votes: incremental fetch
        log.info("syncing_votes")
        start = time.time()
        subprocess.run(
            [str(repo / "env" / "bin" / "usc-run"), "votes",
             f"--congress={CONGRESS}", "--log=info"],
            cwd=str(repo), check=True, timeout=1800,
        )

        from ingest.congress import iter_vote_jsons
        from load.votes import load_votes
        vote_jsons = list(iter_vote_jsons(repo, CONGRESS))
        s_count, p_count = load_votes(vote_jsons)
        total += s_count + p_count
        log.info("votes_synced", summaries=s_count, positions=p_count,
                 elapsed_s=round(time.time() - start, 1))

        # Embed any new bills
        log.info("syncing_embeddings")
        start = time.time()
        from load.embeddings import load_bill_embeddings
        emb_count = load_bill_embeddings()
        total += emb_count
        log.info("embeddings_synced", count=emb_count, elapsed_s=round(time.time() - start, 1))

        log_run_end(run_id, "success", rows_processed=total)
        log.info("daily_sync_complete", total_rows=total)

    except Exception as e:
        log.error("daily_sync_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
