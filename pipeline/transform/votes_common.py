"""
Shared helpers for vote import scripts (bulk + sync).

Provides bioguide resolution maps and party breakdown updates.
"""

import logging

from utils import get_supabase

log = logging.getLogger(__name__)


def build_lis_map() -> dict[str, str]:
    """lis_id -> bioguide_id"""
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
        for row in (res.data or []):
            if row.get("lis_id"):
                mapping[row["lis_id"]] = row["bioguide_id"]
        if len(res.data or []) < 1000:
            break
        offset += 1000
    log.info("LIS map: %d entries", len(mapping))
    return mapping


def build_name_state_map() -> dict[tuple[str, str], str]:
    """(last_name_lower, state) -> bioguide_id for senate fallback matching"""
    db = get_supabase()
    mapping: dict[tuple[str, str], str] = {}
    offset = 0
    while True:
        res = (
            db.table("legislators").select("bioguide_id,last_name,state")
            .range(offset, offset + 999)
            .execute()
        )
        for row in (res.data or []):
            key = (row.get("last_name", "").lower(), row.get("state", "").upper())
            mapping[key] = row["bioguide_id"]
        if len(res.data or []) < 1000:
            break
        offset += 1000
    return mapping


def update_party_breakdowns(vote_ids: list[str]) -> None:
    """
    Compute and update party breakdown columns on bill_vote_summaries
    from the loaded bill_vote_positions + legislators data.
    """
    if not vote_ids:
        return

    db = get_supabase()
    log.info("Updating party breakdowns for %d votes...", len(vote_ids))

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
