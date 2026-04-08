"""
bulk_import_votes.py — Load all roll call votes for given congress(es).

House votes: congress.gov API (beta endpoints — wrapped defensively)
Senate votes: senate.gov XML files

Two-pass load:
  Pass 1: bill_vote_summaries (party breakdown columns NULL)
  Pass 2: bill_vote_positions (individual member votes)
  Pass 3: UPDATE bill_vote_summaries with party breakdowns computed from positions

Usage:
    python3 scripts/bulk/bulk_import_votes.py --congress 118 119
"""

import argparse
import logging
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2]))

from config import CONGRESS_API_BASE, CONGRESS_SESSIONS, UPSERT_BATCH
from load import (
    checkpoint_exists,
    log_run_end,
    log_run_start,
    mark_checkpoint,
    upsert,
)
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
from utils import api_get, batch, download_file, get_supabase

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def _normalize_api_response(data) -> dict:
    """
    congress.gov beta endpoints sometimes return a top-level list instead of a dict.
    If so, take the first element. Always returns a dict (possibly empty).
    """
    if isinstance(data, list):
        first = data[0] if data else {}
        return first if isinstance(first, dict) else {}
    return data if isinstance(data, dict) else {}
log = logging.getLogger(__name__)

SCRIPT = "bulk_import_votes"
SENATE_INDEX_URL = "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_{year}_{session}.xml"
SENATE_VOTE_URL  = "https://www.senate.gov/legislative/LIS/roll_call_votes/vote{congress}{session}/vote_{congress}_{session}_{number:05d}.xml"


def get_api_key() -> str:
    return os.environ.get("CONGRESS_API_KEY", "")


# ── Bioguide resolution maps ──────────────────────────────────────────────────

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


# ── Party breakdown update ────────────────────────────────────────────────────

def update_party_breakdowns(vote_ids: list[str]) -> None:
    """
    Compute and update party breakdown columns on bill_vote_summaries
    from the loaded bill_vote_positions + legislators data.
    """
    if not vote_ids:
        return

    db = get_supabase()
    log.info("Updating party breakdowns for %d votes…", len(vote_ids))

    for vid in vote_ids:
        # Fetch positions with party info via join
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


# ── House votes ───────────────────────────────────────────────────────────────

def import_house_votes(congress: int, api_key: str) -> tuple[list[str], int]:
    """Returns (vote_ids_loaded, position_count)."""
    vote_ids: list[str] = []
    position_count = 0

    for session in [1, 2]:
        year = CONGRESS_SESSIONS.get((congress, session))
        if not year:
            continue

        log.info("House congress=%d session=%d (year=%d)", congress, session, year)
        offset = 0
        page = 0

        while True:
            source_file = f"house_{congress}_{session}"
            list_url = f"{CONGRESS_API_BASE}/house-vote/{congress}/{session}"
            list_data = api_get(list_url, params={"limit": 250, "offset": offset, "format": "json"}, api_key=api_key)
            if not list_data:
                break

            # Beta API response shape varies — handle list, nested dict, or flat dict
            log.debug("house-vote list response type=%s keys=%s",
                      type(list_data).__name__,
                      list(list_data.keys()) if isinstance(list_data, dict) else "n/a")
            if isinstance(list_data, list):
                votes_list = list_data
            elif isinstance(list_data, dict):
                nested = list_data.get("houseRollCallVotes", {})
                if isinstance(nested, list):
                    votes_list = nested
                elif isinstance(nested, dict):
                    votes_list = nested.get("houseRollCallVote", [])
                else:
                    # Try other common top-level keys
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
                log.info("  No votes returned at offset=%d — stopping session %d", offset, session)
                break

            summaries: list[dict] = []
            all_positions: list[dict] = []

            for vote_stub in votes_list:
                roll_call = vote_stub.get("rollCallNumber") or vote_stub.get("voteNumber")
                if not roll_call:
                    continue

                vote_id = house_vote_id(congress, roll_call)

                if checkpoint_exists(SCRIPT, source_file, int(str(roll_call))):
                    vote_ids.append(vote_id)
                    continue

                summary_row = None

                # Fetch detail (beta) — normalize list/dict response shapes
                try:
                    detail_url = f"{CONGRESS_API_BASE}/house-vote/{congress}/{session}/{roll_call}"
                    raw = api_get(detail_url, params={"format": "json"}, api_key=api_key) or {}
                    detail_data = _normalize_api_response(raw)
                    summary_row = transform_vote_summary(detail_data, congress)
                    if summary_row:
                        summaries.append(summary_row)
                except Exception as e:
                    log.warning("House vote detail failed for %s: %s", vote_id, e)

                # Fetch member positions (beta) — normalize list/dict response shapes
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
                    vote_ids.append(vote_id)
                    mark_checkpoint(SCRIPT, source_file, int(str(roll_call)), 1, "success")

            if summaries:
                for chunk in batch(summaries, UPSERT_BATCH):
                    upsert("bill_vote_summaries", chunk)
            if all_positions:
                for chunk in batch(all_positions, UPSERT_BATCH):
                    upsert("bill_vote_positions", chunk)

            offset += 250
            page += 1
            time.sleep(0.1)

            if len(votes_list) < 250:
                break

    return vote_ids, position_count


# ── Senate votes ──────────────────────────────────────────────────────────────

def import_senate_votes(congress: int, lis_map: dict, name_state_map: dict) -> tuple[list[str], int]:
    """Returns (vote_ids_loaded, position_count)."""
    import requests as req

    vote_ids: list[str] = []
    position_count = 0

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

        source_file = f"senate_{congress}_{session}"

        for number_str in vote_numbers:
            try:
                number = int(number_str)
            except ValueError:
                continue

            if checkpoint_exists(SCRIPT, source_file, number):
                vote_ids.append(senate_vote_id(congress, number))
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

            vote_ids.append(summary["id"])
            mark_checkpoint(SCRIPT, source_file, number, 1, "success")

            time.sleep(0.05)

    return vote_ids, position_count


# ── Main ──────────────────────────────────────────────────────────────────────

def run(congresses: list[int]) -> None:
    run_id = log_run_start(SCRIPT)
    api_key = get_api_key()

    try:
        lis_map = build_lis_map()
        name_state_map = build_name_state_map()

        all_vote_ids: list[str] = []
        total_positions = 0

        for congress in congresses:
            log.info("=== Importing votes for congress %d ===", congress)

            house_ids, house_pos = import_house_votes(congress, api_key)
            senate_ids, senate_pos = import_senate_votes(congress, lis_map, name_state_map)

            all_vote_ids.extend(house_ids)
            all_vote_ids.extend(senate_ids)
            total_positions += house_pos + senate_pos

            log.info(
                "Congress %d: %d house votes, %d senate votes, %d positions",
                congress, len(house_ids), len(senate_ids), house_pos + senate_pos
            )

        # Pass 3: update party breakdowns
        log.info("Updating party breakdowns for %d vote records…", len(all_vote_ids))
        update_party_breakdowns(all_vote_ids)

        log.info("Done. Total votes: %d, positions: %d", len(all_vote_ids), total_positions)
        log_run_end(run_id, "success", {
            "total_votes": len(all_vote_ids),
            "total_positions": total_positions,
            "congresses": congresses,
        })

    except Exception as e:
        log.exception("bulk_import_votes failed")
        log_run_end(run_id, "failed", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bulk import roll call votes")
    parser.add_argument(
        "--congress", type=int, nargs="+", required=True,
        help="Congress number(s) to import (e.g. 118 119)"
    )
    args = parser.parse_args()
    run(congresses=args.congress)
