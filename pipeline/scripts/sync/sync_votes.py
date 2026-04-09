"""
sync_votes.py — Hourly incremental vote sync.

House votes: congress.gov API (beta endpoints — wrapped defensively)
Senate votes: senate.gov XML files

Finds already-loaded vote IDs, fetches only new ones, then updates
party breakdowns for newly loaded votes.

Usage:
    python -m scripts.sync.sync_votes
"""

import logging
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2]))

from config import CONGRESS_API_BASE, CONGRESS_SESSIONS, UPSERT_BATCH
from load import log_run_end, log_run_start, upsert
from transform.votes_house import (
    make_vote_id as house_vote_id,
    transform_vote_positions,
    transform_vote_summary,
)
from transform.votes_senate import (
    make_vote_id as senate_vote_id,
    parse_vote_xml,
    resolve_bioguide_ids,
)
from utils import api_get, batch, get_supabase

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

SCRIPT = "sync_votes"
SENATE_INDEX_URL = "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_{year}_{session}.xml"
SENATE_VOTE_URL = "https://www.senate.gov/legislative/LIS/roll_call_votes/vote{congress}{session}/vote_{congress}_{session}_{number:05d}.xml"


def current_congress() -> int:
    return max(c for c, _ in CONGRESS_SESSIONS)


def get_api_key() -> str:
    return os.environ.get("CONGRESS_API_KEY", "")


def _normalize_api_response(data) -> dict:
    """Beta endpoints sometimes return a list instead of a dict."""
    if isinstance(data, list):
        first = data[0] if data else {}
        return first if isinstance(first, dict) else {}
    return data if isinstance(data, dict) else {}


# ── Bioguide resolution maps ────────────────────────────────────────────────


def build_lis_map() -> dict[str, str]:
    """lis_id → bioguide_id"""
    db = get_supabase()
    mapping: dict[str, str] = {}
    offset = 0
    while True:
        res = (
            db.table("legislators").select("bioguide_id,lis_id")
            .not_.is_("lis_id", "null")
            .range(offset, offset + 999)
            .execute()
        )
        for row in res.data:
            if row.get("lis_id"):
                mapping[row["lis_id"]] = row["bioguide_id"]
        if len(res.data) < 1000:
            break
        offset += 1000
    log.info("LIS map: %d entries", len(mapping))
    return mapping


def build_name_state_map() -> dict[tuple[str, str], str]:
    """(last_name_lower, state) → bioguide_id for senate fallback matching"""
    db = get_supabase()
    mapping: dict[tuple[str, str], str] = {}
    offset = 0
    while True:
        res = (
            db.table("legislators").select("bioguide_id,last_name,state")
            .range(offset, offset + 999)
            .execute()
        )
        for row in res.data:
            key = (row.get("last_name", "").lower(), row.get("state", "").upper())
            mapping[key] = row["bioguide_id"]
        if len(res.data) < 1000:
            break
        offset += 1000
    return mapping


# ── Party breakdown update ───────────────────────────────────────────────────


def update_party_breakdowns(vote_ids: list[str]) -> None:
    """Compute and update party breakdown columns on bill_vote_summaries."""
    if not vote_ids:
        return

    db = get_supabase()
    log.info("Updating party breakdowns for %d votes…", len(vote_ids))

    for vid in vote_ids:
        res = (
            db.table("bill_vote_positions")
            .select("position, legislators(party)")
            .eq("vote_id", vid)
            .execute()
        )
        counts: dict[str, dict[str, int]] = {
            "Democrat": {"Yea": 0, "Nay": 0},
            "Republican": {"Yea": 0, "Nay": 0},
            "Independent": {"Yea": 0, "Nay": 0},
        }
        for row in res.data:
            party = (row.get("legislators") or {}).get("party", "Independent")
            pos = row.get("position", "")
            if party in counts and pos in ("Yea", "Nay"):
                counts[party][pos] += 1

        db.table("bill_vote_summaries").update({
            "yea_democrat":    counts["Democrat"]["Yea"],
            "nay_democrat":    counts["Democrat"]["Nay"],
            "yea_republican":  counts["Republican"]["Yea"],
            "nay_republican":  counts["Republican"]["Nay"],
            "yea_independent": counts["Independent"]["Yea"],
            "nay_independent": counts["Independent"]["Nay"],
        }).eq("id", vid).execute()


# ── Load existing vote IDs ───────────────────────────────────────────────────


def load_existing_vote_ids(congress: int, chamber: str) -> set[str]:
    """Load all vote IDs already in bill_vote_summaries for this congress+chamber."""
    db = get_supabase()
    prefix = f"{chamber}-{congress}-"
    result: set[str] = set()
    offset = 0
    while True:
        res = (
            db.table("bill_vote_summaries")
            .select("id")
            .like("id", f"{prefix}%")
            .range(offset, offset + 999)
            .execute()
        )
        for row in res.data:
            result.add(row["id"])
        if len(res.data) < 1000:
            break
        offset += 1000
    return result


# ── House votes ──────────────────────────────────────────────────────────────


def sync_house_votes(congress: int, api_key: str) -> tuple[list[str], int]:
    """Sync new House votes. Returns (new_vote_ids, position_count)."""
    new_vote_ids: list[str] = []
    position_count = 0

    existing = load_existing_vote_ids(congress, "house")
    log.info("House congress=%d: %d votes already loaded", congress, len(existing))

    for session in [1, 2]:
        year = CONGRESS_SESSIONS.get((congress, session))
        if not year:
            continue

        log.info("House congress=%d session=%d (year=%d)", congress, session, year)
        offset = 0

        while True:
            list_url = f"{CONGRESS_API_BASE}/house-vote/{congress}/{session}"
            list_data = api_get(list_url, params={"limit": 250, "offset": offset, "format": "json"}, api_key=api_key)
            if not list_data:
                break

            # Beta API response shape varies
            if isinstance(list_data, list):
                votes_list = list_data
            elif isinstance(list_data, dict):
                nested = list_data.get("houseRollCallVotes", {})
                if isinstance(nested, list):
                    votes_list = nested
                elif isinstance(nested, dict):
                    votes_list = nested.get("houseRollCallVote", [])
                else:
                    votes_list = (
                        list_data.get("votes", [])
                        or list_data.get("houseRollCallVote", [])
                        or []
                    )
            else:
                votes_list = []

            if isinstance(votes_list, dict):
                votes_list = [votes_list]
            if not votes_list:
                break

            summaries: list[dict] = []
            all_positions: list[dict] = []

            for vote_stub in votes_list:
                roll_call = vote_stub.get("rollCallNumber") or vote_stub.get("voteNumber")
                if not roll_call:
                    continue

                vote_id = house_vote_id(congress, roll_call)
                if vote_id in existing:
                    continue

                summary_row = None

                try:
                    detail_url = f"{CONGRESS_API_BASE}/house-vote/{congress}/{session}/{roll_call}"
                    raw = api_get(detail_url, params={"format": "json"}, api_key=api_key) or {}
                    detail_data = _normalize_api_response(raw)
                    summary_row = transform_vote_summary(detail_data, congress)
                    if summary_row:
                        summaries.append(summary_row)
                except Exception as e:
                    log.warning("House vote detail failed for %s: %s", vote_id, e)

                try:
                    members_url = f"{CONGRESS_API_BASE}/house-vote/{congress}/{session}/{roll_call}/members"
                    raw = api_get(members_url, params={"format": "json"}, api_key=api_key) or {}
                    members_data = _normalize_api_response(raw)
                    positions = transform_vote_positions(members_data, vote_id)
                    all_positions.extend(positions)
                    position_count += len(positions)
                except Exception as e:
                    log.warning("House vote members failed for %s: %s", vote_id, e)

                if summary_row:
                    new_vote_ids.append(vote_id)

            if summaries:
                for chunk in batch(summaries, UPSERT_BATCH):
                    upsert("bill_vote_summaries", chunk)
            if all_positions:
                for chunk in batch(all_positions, UPSERT_BATCH):
                    upsert("bill_vote_positions", chunk)

            offset += 250
            if len(votes_list) < 250:
                break
            time.sleep(0.1)

    return new_vote_ids, position_count


# ── Senate votes ─────────────────────────────────────────────────────────────


def sync_senate_votes(congress: int, lis_map: dict, name_state_map: dict) -> tuple[list[str], int]:
    """Sync new Senate votes. Returns (new_vote_ids, position_count)."""
    import requests as req

    new_vote_ids: list[str] = []
    position_count = 0

    existing = load_existing_vote_ids(congress, "senate")
    log.info("Senate congress=%d: %d votes already loaded", congress, len(existing))

    for session in [1, 2]:
        year = CONGRESS_SESSIONS.get((congress, session))
        if not year:
            continue

        log.info("Senate congress=%d session=%d (year=%d)", congress, session, year)
        index_url = SENATE_INDEX_URL.format(year=year, session=session)

        try:
            resp = req.get(index_url, timeout=30)
            resp.raise_for_status()
        except Exception as e:
            log.warning("Could not fetch senate vote index for year=%d session=%d: %s", year, session, e)
            continue

        from lxml import etree
        try:
            root = etree.fromstring(resp.content)
        except etree.XMLSyntaxError as e:
            log.warning("Could not parse senate vote index: %s", e)
            continue

        vote_numbers = [el.text.strip() for el in root.findall(".//vote_number") if el.text]
        log.info("  Found %d votes in index", len(vote_numbers))

        for number_str in vote_numbers:
            try:
                number = int(number_str)
            except ValueError:
                continue

            vote_id = senate_vote_id(congress, number)
            if vote_id in existing:
                continue

            vote_url = SENATE_VOTE_URL.format(
                congress=congress, session=session, number=number
            )
            try:
                vresp = req.get(vote_url, timeout=30)
                vresp.raise_for_status()
                xml_bytes = vresp.content
            except Exception as e:
                log.warning("  Could not fetch senate vote %d: %s", number, e)
                continue

            summary, raw_positions = parse_vote_xml(xml_bytes, congress)
            if not summary:
                continue

            resolved = resolve_bioguide_ids(raw_positions, lis_map, name_state_map)

            upsert("bill_vote_summaries", [summary])
            if resolved:
                for chunk in batch(resolved, UPSERT_BATCH):
                    upsert("bill_vote_positions", chunk)
                position_count += len(resolved)

            new_vote_ids.append(summary["id"])
            time.sleep(0.05)

    return new_vote_ids, position_count


# ── Main ─────────────────────────────────────────────────────────────────────


def run() -> None:
    run_id = log_run_start(SCRIPT)
    api_key = get_api_key()
    congress = current_congress()

    try:
        lis_map = build_lis_map()
        name_state_map = build_name_state_map()

        house_ids, house_pos = sync_house_votes(congress, api_key)
        senate_ids, senate_pos = sync_senate_votes(congress, lis_map, name_state_map)

        all_new_ids = house_ids + senate_ids
        total_positions = house_pos + senate_pos

        log.info(
            "New votes: %d house, %d senate, %d positions",
            len(house_ids), len(senate_ids), total_positions,
        )

        # Update party breakdowns for newly loaded votes
        if all_new_ids:
            update_party_breakdowns(all_new_ids)

        log.info("Done. Total new votes: %d, positions: %d", len(all_new_ids), total_positions)
        log_run_end(run_id, "success", {
            "new_votes": len(all_new_ids),
            "house_votes": len(house_ids),
            "senate_votes": len(senate_ids),
            "positions": total_positions,
            "congress": congress,
        })

    except Exception as e:
        log.exception("%s failed", SCRIPT)
        log_run_end(run_id, "failed", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    run()
