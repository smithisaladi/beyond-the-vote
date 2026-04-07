"""
Syncs bill vote summaries and member positions.

Run: python pipeline/scripts/sync_bill_votes.py

Options (env vars):
  CONGRESS_API_KEY  — required
  LOOKBACK_DAYS     — days of recent activity to look back (default: 7)
"""
import os
import sys
import time
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import httpx
from pipeline.lib.supabase_client import create_service_client
from pipeline.lib.parse_senate_vote_xml import parse_senate_vote_xml
from pipeline.lib.fetch_house_vote import fetch_house_vote
from pipeline.lib.resolve_ids import build_lis_map
from pipeline.lib.config import (
    CONGRESS_BASE, DEFAULT_CONGRESS, PAGE_SIZE_VOTES,
    LOOKBACK_DAYS_VOTES, TIMEOUT_DEFAULT, TIMEOUT_SHORT, BILLS_OFFSET_LIMIT,
    RATE_LIMIT_CONGRESS,
)

CONGRESS_API_KEY = os.environ.get("CONGRESS_API_KEY", "")
LOOKBACK_DAYS = int(os.environ.get("LOOKBACK_DAYS", str(LOOKBACK_DAYS_VOTES)))

BILL_TYPE_ABBREVS: dict[str, str] = {
    "hr":      "H.R.",
    "s":       "S.",
    "hjres":   "H.J.Res.",
    "sjres":   "S.J.Res.",
    "hres":    "H.Res.",
    "sres":    "S.Res.",
    "hconres": "H.Con.Res.",
    "sconres": "S.Con.Res.",
}


def format_bill_number(bill_type: str, number: str | int) -> str:
    prefix = BILL_TYPE_ABBREVS.get(bill_type.lower(), bill_type.upper())
    return f"{prefix} {number}"


def congress_fetch(path: str) -> dict:
    sep = "&" if "?" in path else "?"
    resp = httpx.get(
        f"{CONGRESS_BASE}{path}{sep}format=json&api_key={CONGRESS_API_KEY}",
        timeout=TIMEOUT_DEFAULT,
    )
    resp.raise_for_status()
    return resp.json()


def get_bills_with_recent_activity(congress: int, lookback_days: int) -> list[dict]:
    from_dt = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    bills = []
    offset = 0

    while True:
        data = congress_fetch(
            f"/bill/{congress}?fromDateTime={from_dt}&limit={PAGE_SIZE_VOTES}&offset={offset}&sort=updateDate+desc"
        )
        raw: list[dict] = data.get("bills") or []
        for b in raw:
            if b.get("type") and b.get("number"):
                bills.append({
                    "id":         f"{congress}-{b['type'].lower()}-{b['number']}",
                    "bill_number": format_bill_number(b["type"], b["number"]),
                    "bill_title":  b.get("title", ""),
                })
        time.sleep(RATE_LIMIT_CONGRESS)
        if len(raw) < PAGE_SIZE_VOTES:
            break
        offset += PAGE_SIZE_VOTES
        if offset >= BILLS_OFFSET_LIMIT:
            break

    return bills


def get_recorded_votes_for_bill(bill_id: str) -> list[dict]:
    parts = bill_id.split("-")
    congress, bill_type, number = parts[0], parts[1], parts[2]
    data = congress_fetch(f"/bill/{congress}/{bill_type}/{number}/actions?limit=50")
    votes = []
    for action in data.get("actions") or []:
        for rv in action.get("recordedVotes") or []:
            if rv.get("rollNumber") and rv.get("url"):
                votes.append({
                    "chamber":        rv.get("chamber", ""),
                    "congress":       rv.get("congress") or int(congress),
                    "date":           rv.get("date") or action.get("actionDate", ""),
                    "roll_number":    rv["rollNumber"],
                    "session_number": rv.get("sessionNumber", 1),
                    "url":            rv["url"],
                })
    return votes


def sync_bill_votes(congress: int = DEFAULT_CONGRESS, lookback_days: int = LOOKBACK_DAYS) -> dict:
    if not CONGRESS_API_KEY:
        raise RuntimeError("CONGRESS_API_KEY not set")

    start = time.time()
    supabase = create_service_client()
    now = datetime.now(timezone.utc).isoformat()

    bills_processed = new_votes = positions_stored = 0
    senate_lis_resolutions = senate_resolution_failures = 0

    bill_refs = get_bills_with_recent_activity(congress, lookback_days)
    bills_processed = len(bill_refs)

    for bill in bill_refs:
        bill_id = bill["id"]
        bill_number = bill["bill_number"]
        bill_title = bill["bill_title"]

        try:
            recorded_votes = get_recorded_votes_for_bill(bill_id)
        except Exception:
            continue
        time.sleep(RATE_LIMIT_CONGRESS)

        for rv in recorded_votes:
            vote_id = f"{rv['congress']}-{rv['chamber'].lower()}-{rv['roll_number']}"

            # Skip if already synced; backfill title if missing
            existing = (
                supabase.table("bill_vote_summaries")
                .select("id, title, question")
                .eq("id", vote_id)
                .maybe_single()
                .execute()
            )
            if existing.data:
                if not existing.data.get("title"):
                    q = existing.data.get("question", "")
                    vote_title = f"{bill_number}: {bill_title} — {q}" if bill_title else f"{bill_number} — {q}"
                    supabase.table("bill_vote_summaries").update({"title": vote_title}).eq("id", vote_id).execute()
                continue

            try:
                if rv["chamber"].lower() == "senate":
                    # Senate: fetch XML from senate.gov
                    xml_resp = httpx.get(rv["url"], timeout=TIMEOUT_SHORT)
                    if not xml_resp.is_success:
                        continue
                    parsed = parse_senate_vote_xml(xml_resp.text)

                    # Resolve lis_ids to bioguide_ids
                    lis_ids = [m.lis_member_id for m in parsed.members]
                    lis_map = build_lis_map(supabase, lis_ids)

                    vote_title = (
                        f"{bill_number}: {bill_title} — {parsed.question}"
                        if bill_title else
                        f"{bill_number} — {parsed.question}"
                    )

                    sum_result = supabase.table("bill_vote_summaries").upsert({
                        "id":               vote_id,
                        "bill_id":          bill_id,
                        "congress":         rv["congress"],
                        "chamber":          "Senate",
                        "date":             rv["date"],
                        "title":            vote_title,
                        "question":         parsed.question,
                        "result":           parsed.result,
                        "yea_total":        parsed.yea_total,
                        "nay_total":        parsed.nay_total,
                        "present_total":    parsed.present_total,
                        "not_voting_total": parsed.not_voting_total,
                        "yea_democrat":     parsed.yea_democrat,
                        "nay_democrat":     parsed.nay_democrat,
                        "yea_republican":   parsed.yea_republican,
                        "nay_republican":   parsed.nay_republican,
                        "yea_independent":  parsed.yea_independent,
                        "nay_independent":  parsed.nay_independent,
                        "source_url":       rv["url"],
                        "synced_at":        now,
                    }, on_conflict="id").execute()

                    positions = []
                    for member in parsed.members:
                        bioguide = lis_map.get(member.lis_member_id)
                        if bioguide:
                            positions.append({
                                "vote_id":     vote_id,
                                "bioguide_id": bioguide,
                                "position":    member.vote_cast,
                            })
                            senate_lis_resolutions += 1
                        else:
                            senate_resolution_failures += 1

                    if positions:
                        supabase.table("bill_vote_positions").upsert(
                            positions, on_conflict="vote_id,bioguide_id"
                        ).execute()
                        positions_stored += len(positions)

                    new_votes += 1

                else:
                    # House: Congress.gov House Roll Call API
                    house_data = fetch_house_vote(
                        rv["congress"], rv["roll_number"], CONGRESS_API_KEY, rv["session_number"]
                    )
                    if not house_data:
                        continue

                    vote_title = (
                        f"{bill_number}: {bill_title} — {house_data.question}"
                        if bill_title else
                        f"{bill_number} — {house_data.question}"
                    )

                    supabase.table("bill_vote_summaries").upsert({
                        "id":               vote_id,
                        "bill_id":          bill_id,
                        "congress":         rv["congress"],
                        "chamber":          "House",
                        "date":             rv["date"],
                        "title":            vote_title,
                        "question":         house_data.question,
                        "result":           house_data.result,
                        "yea_total":        house_data.yea_total,
                        "nay_total":        house_data.nay_total,
                        "present_total":    house_data.present_total,
                        "not_voting_total": house_data.not_voting_total,
                        "yea_democrat":     house_data.yea_democrat,
                        "nay_democrat":     house_data.nay_democrat,
                        "yea_republican":   house_data.yea_republican,
                        "nay_republican":   house_data.nay_republican,
                        "yea_independent":  house_data.yea_independent,
                        "nay_independent":  house_data.nay_independent,
                        "source_url":       rv["url"],
                        "synced_at":        now,
                    }, on_conflict="id").execute()

                    # Filter to known legislators
                    all_positions = [
                        {"vote_id": vote_id, "bioguide_id": m.bioguide_id, "position": m.position}
                        for m in house_data.members
                    ]
                    if all_positions:
                        bioguide_ids = [p["bioguide_id"] for p in all_positions]
                        known_resp = (
                            supabase.table("legislators")
                            .select("bioguide_id")
                            .in_("bioguide_id", bioguide_ids)
                            .execute()
                        )
                        known = {r["bioguide_id"] for r in (known_resp.data or [])}
                        valid_positions = [p for p in all_positions if p["bioguide_id"] in known]
                        if valid_positions:
                            supabase.table("bill_vote_positions").upsert(
                                valid_positions, on_conflict="vote_id,bioguide_id"
                            ).execute()
                            positions_stored += len(valid_positions)

                    new_votes += 1

            except Exception as err:
                print(f"  Failed to sync vote {vote_id}: {err}")
                continue
            finally:
                time.sleep(RATE_LIMIT_CONGRESS)

    duration = f"{time.time() - start:.1f}s"
    return {
        "source": "bill-votes",
        "bills_processed": bills_processed,
        "new_votes": new_votes,
        "positions_stored": positions_stored,
        "senate_lis_resolutions": senate_lis_resolutions,
        "senate_resolution_failures": senate_resolution_failures,
        "duration": duration,
    }


if __name__ == "__main__":
    result = sync_bill_votes()
    print(json.dumps(result, indent=2))
