"""
Fetches bills from Congress.gov and upserts them into bill_embeddings.

Run: python pipeline/scripts/sync_bills.py

Options (env vars):
  CONGRESS_API_KEY      — required
  SYNC_BILLS_CONGRESS   — congress number (default: 119)
  SYNC_BILLS_MAX        — max bills to fetch (default: 2000)
"""
import os
import sys
import time
import json
import re
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import httpx
from pipeline.lib.supabase_client import create_service_client
from pipeline.lib.bills import map_status, format_bill_id
from pipeline.lib.topics import classify_bill_topics
from pipeline.lib.fetch_bill_text import fetch_bill_text_xml, extract_text_from_bill_xml
from pipeline.lib.federal_agencies import extract_agencies
from pipeline.lib.parse_citations import extract_citations
from pipeline.lib.config import (
    CONGRESS_BASE, DEFAULT_CONGRESS, MAX_BILLS_DEFAULT,
    PAGE_SIZE_BILLS, UPSERT_BATCH_SIZE, RATE_LIMIT_CONGRESS,
    TIMEOUT_DEFAULT, TIMEOUT_SHORT, SUMMARY_MAX_CHARS, TITLE_MAX_CHARS,
)

CONGRESS_API_KEY = os.environ.get("CONGRESS_API_KEY", "")
TARGET_CONGRESS = int(os.environ.get("SYNC_BILLS_CONGRESS", str(DEFAULT_CONGRESS)))
MAX_BILLS = int(os.environ.get("SYNC_BILLS_MAX", str(MAX_BILLS_DEFAULT)))


def build_bill_id(congress: int, bill_type: str, number: int) -> str:
    return f"{congress}-{bill_type.lower()}-{number}"


def build_congress_gov_url(congress: int, bill_type: str, number: int) -> str:
    type_map = {
        "hr": "house-bill", "s": "senate-bill",
        "hjres": "house-joint-resolution", "sjres": "senate-joint-resolution",
        "hconres": "house-concurrent-resolution", "sconres": "senate-concurrent-resolution",
        "hres": "house-resolution", "sres": "senate-resolution",
    }
    slug = type_map.get(bill_type.lower(), bill_type.lower())
    return f"https://www.congress.gov/bill/{congress}th-congress/{slug}/{number}"


def fetch_page(congress: int, offset: int) -> list[dict]:
    url = (
        f"{CONGRESS_BASE}/bill/{congress}"
        f"?format=json&limit={PAGE_SIZE_BILLS}&offset={offset}"
        f"&sort=updateDate+desc&api_key={CONGRESS_API_KEY}"
    )
    resp = httpx.get(url, timeout=TIMEOUT_DEFAULT)
    resp.raise_for_status()
    return resp.json().get("bills") or []


def fetch_summary(congress: int, bill_type: str, number: int) -> str | None:
    try:
        url = (
            f"{CONGRESS_BASE}/bill/{congress}/{bill_type.lower()}/{number}/summaries"
            f"?format=json&limit=1&api_key={CONGRESS_API_KEY}"
        )
        resp = httpx.get(url, timeout=TIMEOUT_SHORT)
        if not resp.is_success:
            return None
        text = (resp.json().get("summaries") or [{}])[0].get("text")
        if not text:
            return None
        # Strip HTML tags
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text)).strip()[:SUMMARY_MAX_CHARS] or None
    except Exception:
        return None


def sync_bills(congress: int = TARGET_CONGRESS, max_bills: int = MAX_BILLS) -> dict:
    if not CONGRESS_API_KEY:
        raise RuntimeError("CONGRESS_API_KEY not set")

    start = time.time()
    supabase = create_service_client()

    all_bills: list[dict] = []
    offset = 0

    print(f"Fetching up to {max_bills} bills from the {congress}th Congress...")

    while len(all_bills) < max_bills:
        page = fetch_page(congress, offset)
        if not page:
            break
        all_bills.extend(page)
        print(f"  fetched {len(all_bills)} bills so far")
        if len(page) < PAGE_SIZE_BILLS:
            break
        offset += PAGE_SIZE_BILLS
        time.sleep(RATE_LIMIT_CONGRESS)

    bills = all_bills[:max_bills]
    print(f"Fetched {len(bills)} bills total. Upserting into bills...")

    upserted = 0
    now = datetime.now(timezone.utc).isoformat()

    for i in range(0, len(bills), UPSERT_BATCH_SIZE):
        batch = bills[i:i + UPSERT_BATCH_SIZE]
        rows = []

        for b in batch:
            if not (b.get("congress") and b.get("type") and b.get("number") and b.get("title")):
                continue

            summary = fetch_summary(b["congress"], b["type"], b["number"])
            bill_xml = fetch_bill_text_xml(b["congress"], b["type"], b["number"])
            time.sleep(RATE_LIMIT_CONGRESS)

            title = str(b["title"])[:TITLE_MAX_CHARS]
            combined = f"{title}. {summary}" if summary else title
            bill_id = build_bill_id(b["congress"], b["type"], b["number"])

            referenced_agencies: list[str] = []
            referenced_laws: list[str] = []
            referenced_usc: list[str] = []

            if bill_xml:
                full_text = extract_text_from_bill_xml(bill_xml)
                referenced_agencies = extract_agencies(full_text)
                citations = extract_citations(full_text)
                referenced_laws = citations.act_names + citations.public_laws
                referenced_usc = citations.usc_sections

            sponsor = (b.get("sponsors") or [{}])[0]
            latest_action = b.get("latestAction") or {}

            rows.append({
                "bill_id":           bill_id,
                "congress":          b["congress"],
                "title":             title,
                "summary":           summary,
                "combined_text":     combined,
                "bill_number":       format_bill_id(bill_id),
                "status":            map_status(latest_action.get("text"), b.get("introducedDate")),
                "topics":            classify_bill_topics(
                                        (b.get("policyArea") or {}).get("name"),
                                        title, summary, referenced_agencies
                                    ),
                "sponsor_name":      sponsor.get("fullName"),
                "sponsor_bioguide_id": sponsor.get("bioguideId"),
                "sponsor_party":     None,
                "introduced_date":   b.get("introducedDate"),
                "policy_area":       (b.get("policyArea") or {}).get("name"),
                "congress_gov_url":  build_congress_gov_url(b["congress"], b["type"], b["number"]),
                "last_action_text":  latest_action.get("text"),
                "last_action_date":  latest_action.get("actionDate"),
                "referenced_agencies": referenced_agencies,
                "referenced_laws":   referenced_laws,
                "referenced_usc":    referenced_usc,
                "synced_at":         now,
            })

        if rows:
            result = supabase.table("bills").upsert(rows, on_conflict="bill_id").execute()
            upserted += len(rows)
            print(f"  upserted {upserted}/{len(bills)}")

    duration = f"{time.time() - start:.1f}s"
    return {"source": "bills", "fetched": len(bills), "upserted": upserted, "duration": duration}


if __name__ == "__main__":
    result = sync_bills()
    print(json.dumps(result, indent=2))
