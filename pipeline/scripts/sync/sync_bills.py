"""
sync_bills.py — Hourly incremental bill sync from congress.gov API.

Fetches bills updated since the last successful run using the fromDateTime
parameter. Only keeps bills that have a recorded vote.

Usage:
    python -m scripts.sync.sync_bills
"""

import logging
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2]))

from config import BILL_PAGE_SIZE, CONGRESS_API_BASE, CONGRESS_SESSIONS, UPSERT_BATCH
from load import get_watermark, log_run_end, log_run_start, upsert
from transform.bills import make_bill_id, transform_bill
from utils import api_get, batch, get_supabase

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

SCRIPT = "sync_bills"


def current_congress() -> int:
    return max(c for c, _ in CONGRESS_SESSIONS)


def get_api_key() -> str:
    key = os.environ.get("CONGRESS_API_KEY", "")
    if not key:
        log.warning("CONGRESS_API_KEY not set — requests may be rate-limited more aggressively")
    return key


def fetch_bill_detail(congress: int, bill_type: str, number: str, api_key: str) -> dict | None:
    url = f"{CONGRESS_API_BASE}/bill/{congress}/{bill_type.lower()}/{number}"
    data = api_get(url, params={"format": "json"}, api_key=api_key)
    if not data:
        return None
    return data.get("bill")


def fetch_bill_summary(congress: int, bill_type: str, number: str, api_key: str) -> str | None:
    url = f"{CONGRESS_API_BASE}/bill/{congress}/{bill_type.lower()}/{number}/summaries"
    data = api_get(url, params={"format": "json"}, api_key=api_key)
    if not data:
        return None
    summaries = data.get("summaries", [])
    if not summaries:
        return None
    text = summaries[-1].get("text", "")
    if text:
        return re.sub(r"<[^>]+>", " ", text).strip() or None
    return None


def fetch_bill_subjects(congress: int, bill_type: str, number: str, api_key: str) -> list[str]:
    url = f"{CONGRESS_API_BASE}/bill/{congress}/{bill_type.lower()}/{number}/subjects"
    data = api_get(url, params={"format": "json"}, api_key=api_key)
    if not data:
        return []
    subjects_data = data.get("subjects", {})
    items = subjects_data.get("legislativeSubjects", []) if isinstance(subjects_data, dict) else []
    return [s.get("name", "") for s in items if s.get("name")]


def load_voted_bill_ids() -> set[str]:
    """Load the set of bill_ids that have at least one recorded vote."""
    db = get_supabase()
    result: set[str] = set()
    offset = 0
    while True:
        res = db.table("bill_vote_summaries").select("bill_id").range(offset, offset + 999).execute()
        for row in res.data:
            if row.get("bill_id"):
                result.add(row["bill_id"])
        if len(res.data) < 1000:
            break
        offset += 1000
    log.info("Loaded %d voted bill_ids", len(result))
    return result


def run() -> None:
    run_id = log_run_start(SCRIPT)
    api_key = get_api_key()
    congress = current_congress()

    try:
        # Determine watermark
        watermark = get_watermark(SCRIPT)
        if watermark:
            from_dt = watermark
            log.info("Watermark: %s", from_dt)
        else:
            from_dt = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
            log.info("No previous run — fetching bills from last 30 days (%s)", from_dt)

        voted_ids = load_voted_bill_ids()

        total_upserted = 0
        offset = 0

        while True:
            url = f"{CONGRESS_API_BASE}/bill/{congress}"
            params = {
                "format": "json",
                "limit": BILL_PAGE_SIZE,
                "offset": offset,
                "fromDateTime": from_dt,
            }
            data = api_get(url, params=params, api_key=api_key)
            if not data:
                break

            bills_list = data.get("bills", [])
            if not bills_list:
                break

            db_rows: list[dict] = []
            skipped = 0
            for bill_stub in bills_list:
                bill_type = bill_stub.get("type", "")
                number = bill_stub.get("number", "")
                if not bill_type or not number:
                    continue

                bill_id = make_bill_id(congress, bill_type, number)
                if bill_id not in voted_ids:
                    skipped += 1
                    continue

                detail = fetch_bill_detail(congress, bill_type, number, api_key)
                if not detail:
                    continue

                summary_text = fetch_bill_summary(congress, bill_type, number, api_key)
                if summary_text:
                    detail["_summary_text"] = summary_text

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

            log.info("Page offset=%d: %d stubs, %d skipped (no votes), %d upserted", offset, len(bills_list), skipped, len(db_rows))

            offset += BILL_PAGE_SIZE
            if len(bills_list) < BILL_PAGE_SIZE:
                break
            time.sleep(0.1)

        log.info("Done. Total bills upserted: %d", total_upserted)
        log_run_end(run_id, "success", {"upserted": total_upserted, "congress": congress})

    except Exception as e:
        log.exception("%s failed", SCRIPT)
        log_run_end(run_id, "failed", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    run()
