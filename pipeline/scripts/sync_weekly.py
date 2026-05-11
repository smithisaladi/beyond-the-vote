"""Weekly sync: FEC data via OpenFEC API + legislators + VoteView + employer enrichment.

Uses the FEC API for incremental updates (no bulk file downloads).
Designed to run in GitHub Actions.

Usage: cd pipeline && uv run python -m scripts.sync_weekly
Requires: FEC_API_KEY env var (get one at https://api.data.gov/signup/)
"""
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from shared.observability import configure_logging
from shared.db import upsert, log_run_start, log_run_end, get_watermark

import structlog
configure_logging(service="pipeline", debug=True)
log = structlog.get_logger()

DATA_DIR = Path(__file__).parent.parent / "data"
FEC_CYCLES = [2024, 2026]
SCRIPT = "sync_weekly"


def sync_legislators():
    """Refresh current legislators from congress-legislators YAML."""
    from ingest.legislators import sync, load_current
    from load.legislators import load_legislators
    repo_dir = sync(DATA_DIR)
    current = load_current(repo_dir)
    count = load_legislators(current, [])
    log.info("legislators_synced", count=count)
    return count


def sync_voteview():
    """Refresh VoteView NOMINATE scores."""
    from ingest.voteview import download_scores, parse_scores
    from ingest.legislators import sync, load_current
    from load.scores import load_scores
    repo_dir = sync(DATA_DIR)
    current = load_current(repo_dir)
    icpsr_map = {str(r.get("id", {}).get("icpsr", "")): r["id"]["bioguide"]
                 for r in current if r.get("id", {}).get("icpsr") and r.get("id", {}).get("bioguide")}
    csv_path = download_scores(DATA_DIR)
    records = parse_scores(csv_path)
    count = load_scores(records, icpsr_map)
    log.info("voteview_synced", count=count)
    return count


def sync_fec_api():
    """Incremental FEC sync via OpenFEC API."""
    from ingest.fec_api import (
        fetch_pac_contributions, fetch_independent_expenditures,
        transform_api_pac_contribution, transform_api_ie,
    )

    # Get watermark — last successful sync date
    watermark = get_watermark(SCRIPT)
    if watermark:
        since_date = watermark[:10]  # ISO date portion
    else:
        since_date = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")

    log.info("fec_api_sync_starting", since_date=since_date)
    total = 0

    for cycle in FEC_CYCLES:
        # PAC contributions
        log.info("fetching_pac_contributions", cycle=cycle, since=since_date)
        raw_pacs = fetch_pac_contributions(since_date=since_date, two_year_transaction_period=cycle)
        pac_rows = [r for r in (transform_api_pac_contribution(rec, cycle) for rec in raw_pacs) if r]
        if pac_rows:
            upsert("pac_to_candidate", pac_rows, on_conflict="sub_id", schema="fec")
            total += len(pac_rows)
        log.info("pac_contributions_synced", cycle=cycle, count=len(pac_rows))

        # Independent expenditures
        log.info("fetching_ie", cycle=cycle, since=since_date)
        raw_ies = fetch_independent_expenditures(since_date=since_date, cycle=cycle)
        ie_rows = [r for r in (transform_api_ie(rec, cycle) for rec in raw_ies) if r]
        if ie_rows:
            upsert("independent_expenditures", ie_rows, on_conflict="sub_id", schema="fec")
            total += len(ie_rows)
        log.info("ie_synced", cycle=cycle, count=len(ie_rows))

    log.info("fec_api_sync_complete", total=total)
    return total


def sync_employer_enrichment():
    """Re-run employer normalization + industry classification on any new employers."""
    from enrich.opensecrets import run_industry_classification_opensecrets
    count = run_industry_classification_opensecrets(DATA_DIR)
    log.info("industry_reclassified", count=count)
    return count


def main():
    run_id = log_run_start(SCRIPT)
    total = 0
    failed = []

    steps = [
        ("legislators", sync_legislators),
        ("voteview", sync_voteview),
        ("fec_api", sync_fec_api),
        ("employer_enrichment", sync_employer_enrichment),
    ]

    for name, fn in steps:
        log.info("step_starting", step=name)
        start = time.time()
        try:
            count = fn()
            total += count
            log.info("step_completed", step=name, rows=count, elapsed_s=round(time.time() - start, 1))
        except Exception as e:
            log.error("step_failed", step=name, error=str(e))
            failed.append(name)

    status = "success" if not failed else "partial"
    log_run_end(run_id, status, rows_processed=total, metadata={"failed": failed})
    log.info("weekly_sync_complete", status=status, total=total, failed=failed)

    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
