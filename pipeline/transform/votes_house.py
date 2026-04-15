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
    return f"house-{congress}-{int(roll_call)}"


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
    date = vote.get("startDate") or vote.get("actionDate") or vote.get("date")

    # Vote totals — votePartyTotal is a list of per-party objects
    yea_total = 0
    nay_total = 0
    present_total = 0
    not_voting_total = 0
    party_totals = vote.get("votePartyTotal") or vote.get("totals") or []
    if isinstance(party_totals, list):
        for pt in party_totals:
            yea_total += _safe_int(pt.get("yeaTotal")) or 0
            nay_total += _safe_int(pt.get("nayTotal")) or 0
            present_total += _safe_int(pt.get("presentTotal")) or 0
            not_voting_total += _safe_int(pt.get("notVotingTotal")) or 0
    elif isinstance(party_totals, dict):
        yea_total = _safe_int(party_totals.get("yea") or party_totals.get("yeaTotal")) or 0
        nay_total = _safe_int(party_totals.get("nay") or party_totals.get("nayTotal")) or 0
        present_total = _safe_int(party_totals.get("present") or party_totals.get("presentTotal")) or 0
        not_voting_total = _safe_int(party_totals.get("notVoting") or party_totals.get("notVotingTotal")) or 0

    result = vote.get("result") or vote.get("voteResult") or ""
    question = vote.get("voteQuestion") or vote.get("question") or ""
    title = vote.get("legislationTitle") or vote.get("title") or question or ""

    # Bill reference — API uses legislationType/legislationNumber at top level
    bill_type = (vote.get("legislationType") or "").lower()
    bill_number = vote.get("legislationNumber")
    if bill_type and bill_number:
        bill_id = f"{congress}-{bill_type}-{bill_number}"
    else:
        # Fallback: try nested bill object
        bill_ref = vote.get("bill") or vote.get("legislation") or {}
        bill_ref = bill_ref if isinstance(bill_ref, dict) else {}
        bill_id = _extract_bill_id(bill_ref, congress)

    source_url = vote.get("sourceDataURL") or vote.get("url") or ""

    return {
        "id":              vote_id,
        "bill_id":         bill_id,
        "congress":        congress,
        "chamber":         "House",
        "date":            date,
        "title":           title,
        "question":        question,
        "result":          result,
        "required":        vote.get("requiredForPassage") or vote.get("required"),
        "yea_total":       yea_total,
        "nay_total":       nay_total,
        "present_total":   present_total,
        "not_voting_total": not_voting_total,
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

    # API nests members under houseRollCallVoteMemberVotes.results or members
    if isinstance(members_data, list):
        member_list = members_data
    else:
        # Primary path: houseRollCallVoteMemberVotes.results
        wrapper = members_data.get("houseRollCallVoteMemberVotes") or {}
        if isinstance(wrapper, dict):
            member_list = wrapper.get("results") or []
        else:
            member_list = []
        # Fallback: try other nesting
        if not member_list:
            members_block = members_data.get("members", {})
            if isinstance(members_block, list):
                member_list = members_block
            elif isinstance(members_block, dict):
                member_list = members_block.get("member", [])
            else:
                member_list = members_data.get("results", []) or []

    if isinstance(member_list, dict):
        member_list = [member_list]

    for m in member_list:
        bioguide_id = m.get("bioguideID") or m.get("bioguideId") or m.get("bioguide_id")
        vote_raw = m.get("voteCast") or m.get("votePosition") or m.get("position") or ""
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
