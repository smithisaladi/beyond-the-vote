"""
bulk_import_bills.py — Paginate congress.gov API and load all bills for given congress(es).

Rate limit: 1,000 req/hour. Bulk bill import takes 100+ hours for a full congress.
Checkpoints every page so the job can be resumed after interruption.

Usage:
    python scripts/bulk/bulk_import_bills.py --congress 118 119
    python3 scripts/bulk/bulk_import_bills.py --congress 119 --resume
"""

import argparse
import logging
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2]))

from config import (
    BILL_PAGE_SIZE,
    CONGRESS_API_BASE,
    UPSERT_BATCH,
)
from load import (
    checkpoint_exists,
    log_run_end,
    log_run_start,
    mark_checkpoint,
    upsert,
)
from transform.bills import transform_bill
from utils import api_get, batch

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

SCRIPT = "bulk_import_bills"


def get_api_key() -> str:
    key = os.environ.get("CONGRESS_API_KEY", "")
    if not key:
        log.warning("CONGRESS_API_KEY not set — requests may be rate-limited more aggressively")
    return key


def fetch_bill_list(congress: int, offset: int, api_key: str) -> tuple[list[dict], int]:
    """Fetch a page of bills. Returns (bills, total_count)."""
    url = f"{CONGRESS_API_BASE}/bill/{congress}"
    data = api_get(url, params={"limit": BILL_PAGE_SIZE, "offset": offset, "format": "json"}, api_key=api_key)
    if not data:
        return [], 0
    bills = data.get("bills", [])
    pagination = data.get("pagination", {})
    total = pagination.get("count", 0)
    return bills, total


def fetch_bill_detail(congress: int, bill_type: str, number: str, api_key: str) -> dict | None:
    """Fetch full bill detail including summaries and subjects."""
    url = f"{CONGRESS_API_BASE}/bill/{congress}/{bill_type.lower()}/{number}"
    data = api_get(url, params={"format": "json"}, api_key=api_key)
    if not data:
        return None
    return data.get("bill")


def fetch_bill_subjects(congress: int, bill_type: str, number: str, api_key: str) -> list[str]:
    """Fetch legislative subjects for a bill."""
    url = f"{CONGRESS_API_BASE}/bill/{congress}/{bill_type.lower()}/{number}/subjects"
    data = api_get(url, params={"format": "json"}, api_key=api_key)
    if not data:
        return []
    subjects_data = data.get("subjects", {})
    items = subjects_data.get("legislativeSubjects", []) if isinstance(subjects_data, dict) else []
    return [s.get("name", "") for s in items if s.get("name")]


def fetch_bill_summary(congress: int, bill_type: str, number: str, api_key: str) -> str | None:
    """
    Fetch bill summary text from the /summaries sub-endpoint.
    The main bill detail endpoint only returns a count/url, not the actual text.
    Returns the most recent summary text (HTML stripped), or None if unavailable.
    """
    url = f"{CONGRESS_API_BASE}/bill/{congress}/{bill_type.lower()}/{number}/summaries"
    data = api_get(url, params={"format": "json"}, api_key=api_key)
    if not data:
        return None
    summaries = data.get("summaries", [])
    if not summaries:
        return None
    # Last entry is most recent
    latest = summaries[-1]
    text = latest.get("text", "")
    if text:
        import re
        return re.sub(r"<[^>]+>", " ", text).strip() or None
    return None


def load_completed_pages(congress: int) -> set[int]:
    """Preload all completed page checkpoints for a congress in one query."""
    from utils import get_supabase
    db = get_supabase()
    source_file = f"congress_{congress}_bills"
    completed: set[int] = set()
    offset = 0
    while True:
        res = (
            db.table("bulk_import_checkpoints")
            .select("chunk_index")
            .eq("script", SCRIPT)
            .eq("source_file", source_file)
            .eq("status", "success")
            .range(offset, offset + 999)
            .execute()
        )
        for row in (res.data or []):
            completed.add(row["chunk_index"])
        if len(res.data or []) < 1000:
            break
        offset += 1000
    log.info("Congress %d: %d pages already completed", congress, len(completed))
    return completed


def process_congress(congress: int, api_key: str) -> int:
    """Fetch and upsert all bills for one congress. Returns count upserted."""
    total_upserted = 0
    offset = 0
    page = 0
    source_file = f"congress_{congress}_bills"

    completed_pages = load_completed_pages(congress)

    # Get total count
    _, total = fetch_bill_list(congress, 0, api_key)
    log.info("Congress %d: ~%d total bills to fetch", congress, total)

    while True:
        chunk_index = page

        if chunk_index in completed_pages:
            log.info("  Skipping page %d (already processed)", page)
            offset += BILL_PAGE_SIZE
            page += 1
            continue

        bills_list, total = fetch_bill_list(congress, offset, api_key)
        if not bills_list:
            log.info("  No more bills at offset=%d", offset)
            break

        mark_checkpoint(SCRIPT, source_file, chunk_index, 0, "pending")

        db_rows: list[dict] = []
        for bill_stub in bills_list:
            bill_type = bill_stub.get("type", "")
            number = bill_stub.get("number", "")
            if not bill_type or not number:
                continue

            detail = fetch_bill_detail(congress, bill_type, number, api_key)
            if not detail:
                continue

            # Fetch summary text from dedicated sub-endpoint (main detail only has count/url)
            summary_text = fetch_bill_summary(congress, bill_type, number, api_key)
            if summary_text:
                detail["_summary_text"] = summary_text

            # Inject subjects from subjects endpoint if not in detail
            if not detail.get("subjects"):
                subjects = fetch_bill_subjects(congress, bill_type, number, api_key)
                detail["subjects"] = {
                    "legislativeSubjects": [{"name": s} for s in subjects]
                }

            row = transform_bill(detail)
            if not row:
                continue
            db_rows.append(row)

        if db_rows:
            for chunk in batch(db_rows, UPSERT_BATCH):
                upsert("bills", chunk)
            total_upserted += len(db_rows)

        mark_checkpoint(SCRIPT, source_file, chunk_index, len(db_rows), "success")
        log.info(
            "  Page %d: fetched %d bills, upserted %d (total so far: %d)",
            page, len(bills_list), len(db_rows), total_upserted
        )

        offset += BILL_PAGE_SIZE
        page += 1

        # Small courtesy sleep between pages to be a good API citizen
        time.sleep(0.1)

    return total_upserted


def run(congresses: list[int]) -> None:
    run_id = log_run_start(SCRIPT)
    api_key = get_api_key()
    total = 0

    try:
        for congress in congresses:
            log.info("=== Importing bills for congress %d ===", congress)
            n = process_congress(congress, api_key)
            total += n
            log.info("Congress %d complete: %d bills upserted", congress, n)

        log.info("All done. Total bills upserted: %d", total)
        log_run_end(run_id, "success", {"total_bills": total, "congresses": congresses})

    except Exception as e:
        log.exception("bulk_import_bills failed")
        log_run_end(run_id, "failed", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bulk import bills from congress.gov API")
    parser.add_argument(
        "--congress", type=int, nargs="+", required=True,
        help="Congress number(s) to import (e.g. 118 119)"
    )
    args = parser.parse_args()
    run(congresses=args.congress)
