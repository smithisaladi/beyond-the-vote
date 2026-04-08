"""
Transform congress.gov house-vote API responses → bill_vote_summaries + bill_vote_positions rows.

Note: The /house-vote detail and /members endpoints are beta. This module wraps
all field access defensively and logs unexpected schema changes.
"""

from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger(__name__)

# Position normalization
POSITION_MAP = {
    "yea": "Yea", "aye": "Yea", "yes": "Yea",
    "nay": "Nay", "no": "Nay",
    "present": "Present",
    "not voting": "Not Voting", "notvoting": "Not Voting",
    "abstain": "Not Voting",
}


def make_vote_id(congress: int, roll_call: int | str) -> str:
    return f"house-{congress}-{roll_call}"


def transform_vote_summary(detail: dict, congress: int) -> dict | None:
    """
    Convert a congress.gov house-vote detail response to a bill_vote_summaries row.
    Returns None if required fields are missing.
    """
    if not detail or not isinstance(detail, dict):
        return None

    raw_vote = detail.get("houseRollCallVote") or detail.get("vote") or detail
    # API may return the vote wrapped in a list — unwrap it
    if isinstance(raw_vote, list):
        raw_vote = raw_vote[0] if raw_vote else {}
    vote = raw_vote if isinstance(raw_vote, dict) else {}
    roll_call = vote.get("rollCallNumber") or vote.get("voteNumber")
    if not roll_call:
        log.warning("House vote missing rollCallNumber: %s", detail)
        return None

    vote_id = make_vote_id(congress, roll_call)
    date = vote.get("updateDate") or vote.get("actionDate") or vote.get("date")

    # Vote totals — field names vary across beta API versions
    totals_raw = vote.get("totals") or vote.get("votePartyTotal") or {}
    totals = totals_raw if isinstance(totals_raw, dict) else {}
    yea_total = _safe_int(totals.get("yea") or totals.get("totalYea") or totals.get("yea_total") or 0)
    nay_total = _safe_int(totals.get("nay") or totals.get("totalNay") or totals.get("nay_total") or 0)
    present = _safe_int(totals.get("present") or 0)
    not_voting = _safe_int(totals.get("notVoting") or totals.get("not_voting") or 0)

    result = vote.get("voteResult") or vote.get("result") or ""
    question = vote.get("question") or vote.get("voteQuestion") or ""
    bill_ref_raw = vote.get("bill") or vote.get("legislation") or {}
    bill_ref = bill_ref_raw if isinstance(bill_ref_raw, dict) else {}
    bill_id = _extract_bill_id(bill_ref, congress)
    source_url = vote.get("url") or ""

    return {
        "id":              vote_id,
        "bill_id":         bill_id or f"house-{congress}-{roll_call}",
        "congress":        congress,
        "chamber":         "House",
        "date":            date,
        "question":        question,
        "result":          result,
        "required":        vote.get("requiredForPassage") or vote.get("required"),
        "yea_total":       yea_total or 0,
        "nay_total":       nay_total or 0,
        "present_total":   present or 0,
        "not_voting_total": not_voting or 0,
        # Party breakdown filled in second pass
        "yea_democrat":    None,
        "nay_democrat":    None,
        "yea_republican":  None,
        "nay_republican":  None,
        "yea_independent": None,
        "nay_independent": None,
        "source_url":      source_url,
    }


def transform_vote_positions(members_data: dict, vote_id: str) -> list[dict]:
    """
    Convert a congress.gov /members response to bill_vote_positions rows.
    Returns list of {vote_id, bioguide_id, position} dicts.
    """
    positions = []
    if not members_data:
        return positions

    # Beta API nests members under various keys; values may be lists or dicts
    if isinstance(members_data, list):
        member_list = members_data
    else:
        members_block = members_data.get("members", {})
        if isinstance(members_block, list):
            member_list = members_block
        elif isinstance(members_block, dict):
            member_list = members_block.get("member", [])
        else:
            member_list = members_data.get("member", []) or []

    if isinstance(member_list, dict):
        member_list = [member_list]

    for m in member_list:
        bioguide_id = m.get("bioguideId") or m.get("bioguide_id")
        vote_raw = m.get("votePosition") or m.get("position") or ""
        position = POSITION_MAP.get(vote_raw.lower().strip())
        if not position:
            log.debug("Unknown position '%s' for %s", vote_raw, bioguide_id)
            position = "Not Voting"
        if bioguide_id:
            positions.append({
                "vote_id":     vote_id,
                "bioguide_id": bioguide_id,
                "position":    position,
            })

    return positions


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_bill_id(bill_ref: dict, congress: int) -> str | None:
    if not bill_ref:
        return None
    bill_type = (bill_ref.get("type") or "").lower()
    number = bill_ref.get("number") or bill_ref.get("billNumber")
    if bill_type and number:
        return f"{congress}-{bill_type}-{number}"
    return None


def _safe_int(val: Any) -> int | None:
    try:
        return int(val) if val is not None else None
    except (ValueError, TypeError):
        return None
