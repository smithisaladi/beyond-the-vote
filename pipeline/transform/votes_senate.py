"""
Transform senate.gov XML roll call votes → bill_vote_summaries + bill_vote_positions rows.

Senate votes use XML files from:
  https://www.senate.gov/legislative/LIS/roll_call_votes/vote{congress}{session}/vote_{congress}_{session}_{number:05d}.xml
"""

from __future__ import annotations

import logging
import re
from typing import Any

from lxml import etree

log = logging.getLogger(__name__)

POSITION_MAP = {
    "yea": "Yea", "aye": "Yea", "yes": "Yea",
    "nay": "Nay", "no": "Nay",
    "not voting": "Not Voting", "absent": "Not Voting",
    "present": "Present",
    "guilty": "Yea", "not guilty": "Nay",
}


def make_vote_id(congress: int, roll_call: int | str) -> str:
    return f"senate-{congress}-{int(roll_call)}"


def parse_vote_xml(xml_bytes: bytes, congress: int) -> tuple[dict | None, list[dict]]:
    """
    Parse a senate.gov roll call XML file.
    Returns (summary_row, positions_list). summary_row is None on parse failure.
    """
    try:
        root = etree.fromstring(xml_bytes)
    except etree.XMLSyntaxError as e:
        log.error("XML parse error: %s", e)
        return None, []

    roll_call = _text(root, ".//congress_vote_number") or _text(root, ".//vote_number")
    if not roll_call:
        log.warning("Senate XML missing vote number")
        return None, []

    vote_id = make_vote_id(congress, roll_call)
    date = _text(root, ".//vote_date") or _text(root, ".//date")
    question = _text(root, ".//vote_question_text") or _text(root, ".//question")
    result = _text(root, ".//vote_result") or _text(root, ".//result") or ""
    title = _text(root, ".//vote_title") or _text(root, ".//title") or question or ""

    yea_total = _safe_int(_text(root, ".//yeas"))
    nay_total = _safe_int(_text(root, ".//nays"))
    present = _safe_int(_text(root, ".//present"))
    not_voting = _safe_int(_text(root, ".//absent"))

    bill_id = _extract_bill_id(root, congress)

    summary = {
        "id":              vote_id,
        "bill_id":         bill_id,
        "congress":        congress,
        "chamber":         "Senate",
        "date":            _parse_date(date),
        "title":           title,
        "question":        question,
        "result":          result,
        "required":        _text(root, ".//majority_requirement"),
        "yea_total":       yea_total or 0,
        "nay_total":       nay_total or 0,
        "present_total":   present or 0,
        "not_voting_total": not_voting or 0,
        "yea_democrat":    None,
        "nay_democrat":    None,
        "yea_republican":  None,
        "nay_republican":  None,
        "yea_independent": None,
        "nay_independent": None,
        "source_url":      "",
    }

    positions = _parse_positions(root, vote_id)
    return summary, positions


def resolve_bioguide_ids(
    positions_raw: list[dict],
    lis_to_bioguide: dict[str, str],
    name_state_to_bioguide: dict[tuple[str, str], str],
) -> list[dict]:
    """
    Resolve bioguide_ids from senate member data.
    Tries lis_member_id first, then falls back to (last_name, state) matching.
    Drops rows that cannot be resolved.
    """
    resolved = []
    unresolved = 0
    for p in positions_raw:
        bioguide_id = (
            lis_to_bioguide.get(p.get("lis_member_id", ""))
            or name_state_to_bioguide.get((p.get("last_name", "").lower(), p.get("state", "")))
        )
        if bioguide_id:
            resolved.append({
                "vote_id":     p["vote_id"],
                "bioguide_id": bioguide_id,
                "position":    p["position"],
            })
        else:
            unresolved += 1
    if unresolved:
        log.debug("Could not resolve bioguide_id for %d senate members", unresolved)
    return resolved


# ── Internal helpers ──────────────────────────────────────────────────────────

def _parse_positions(root: etree._Element, vote_id: str) -> list[dict]:
    """Extract raw position records (pre-bioguide resolution)."""
    positions = []
    for member in root.findall(".//member"):
        last_name = _text(member, "last_name") or _text(member, "name") or ""
        state = _text(member, "state") or ""
        lis_id = _text(member, "lis_member_id") or ""
        vote_raw = _text(member, "vote_cast") or _text(member, "position") or ""
        position = POSITION_MAP.get(vote_raw.lower().strip(), "Not Voting")
        positions.append({
            "vote_id":       vote_id,
            "last_name":     last_name.lower(),
            "state":         state.upper(),
            "lis_member_id": lis_id,
            "position":      position,
        })
    return positions


# Map document_type values from senate.gov XML to canonical bill_type slugs
_DOC_TYPE_MAP: dict[str, str] = {
    "s.":        "s",
    "h.r.":      "hr",
    "s.j.res.":  "sjres",
    "h.j.res.":  "hjres",
    "s.con.res.": "sconres",
    "h.con.res.": "hconres",
    "s.res.":    "sres",
    "h.res.":    "hres",
}


def _extract_bill_id(root: etree._Element, congress: int) -> str | None:
    # Primary path: <document>/<document_type> + <document>/<document_number>
    doc_type = _text(root, ".//document/document_type")
    doc_number = _text(root, ".//document/document_number")
    if doc_type and doc_number:
        bill_type = _DOC_TYPE_MAP.get(doc_type.lower().strip())
        if bill_type and doc_number.isdigit():
            return f"{congress}-{bill_type}-{doc_number}"

    # Fallback: <bill_number> element (e.g. "S.123", "H.R.456")
    number = _text(root, ".//bill_number")
    if not number:
        return None
    m = re.match(r"^(S|HR|H\.R|HJRES|SJRES|HCONRES|SCONRES|HRES|SRES)\.?\s*(\d+)", number, re.I)
    if m:
        btype = m.group(1).lower().replace(".", "").replace(" ", "")
        return f"{congress}-{btype}-{m.group(2)}"
    return None


def _text(element: etree._Element, path: str) -> str | None:
    el = element.find(path)
    if el is not None and el.text:
        return el.text.strip()
    return None


def _safe_int(val: str | None) -> int | None:
    try:
        return int(val) if val else None
    except (ValueError, TypeError):
        return None


def _parse_date(raw: str | None) -> str | None:
    """Best-effort parse of senate date strings to ISO format."""
    if not raw:
        return None
    # Try "January 15, 2024" style
    import datetime
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.datetime.strptime(raw.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return raw
