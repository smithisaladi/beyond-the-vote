"""
Transform congress.gov API responses → bills DB rows.
"""

from __future__ import annotations

import logging
import re

from config import BILL_STATUS_RULES, TOPIC_SLUG_MAP

log = logging.getLogger(__name__)


def make_bill_id(congress: int, bill_type: str, number: str | int) -> str:
    """Canonical bill_id format: '118-s-1247'"""
    return f"{congress}-{bill_type.lower()}-{number}"


def transform_bill(detail: dict) -> dict | None:
    """
    Convert a congress.gov bill detail response to a bills DB row.
    `detail` is the value under the 'bill' key in the API response.
    Returns None if required fields are missing.
    """
    if not detail:
        return None

    congress = detail.get("congress")
    bill_type = detail.get("type", "").lower()
    number = detail.get("number")

    if not all([congress, bill_type, number]):
        log.warning("Bill missing congress/type/number: %s", detail.get("title"))
        return None

    bill_id = make_bill_id(congress, bill_type, number)
    bill_number = _format_bill_number(bill_type, number)

    sponsor = _extract_sponsor(detail)
    latest_action = detail.get("latestAction", {}) or {}
    policy_area = (detail.get("policyArea") or {}).get("name")

    # _summary_text is pre-fetched by the script from the /summaries sub-endpoint
    summary_text = detail.get("_summary_text") or None
    if not summary_text:
        # Fallback: check if summaries were embedded in the detail response
        summaries = detail.get("summaries", {})
        if isinstance(summaries, list) and summaries:
            summary_text = _clean_html(summaries[-1].get("text", "")) or None

    subjects = _extract_subjects(detail)
    topics = _subjects_to_slugs(subjects)
    status = _derive_status(latest_action.get("text", ""), detail)

    return {
        "bill_id":              bill_id,
        "bill_number":          bill_number,
        "congress":             congress,
        "title":                detail.get("title", ""),
        "summary":              summary_text,
        "status":               status,
        "introduced_date":      detail.get("introducedDate"),
        "policy_area":          policy_area,
        "sponsor_name":         sponsor.get("name"),
        "sponsor_bioguide_id":  sponsor.get("bioguide_id"),
        "sponsor_party":        sponsor.get("party"),
        "last_action_text":     latest_action.get("text"),
        "last_action_date":     latest_action.get("actionDate"),
        "congress_gov_url":     _build_congress_gov_url(congress, bill_type, str(number)),
        "topics":               topics,
        "referenced_agencies":  [],
        "referenced_laws":      [],
        "referenced_usc":       [],
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

_BILL_TYPE_TO_PATH = {
    "hr":      "house-bill",
    "s":       "senate-bill",
    "hres":    "house-simple-resolution",
    "sres":    "senate-simple-resolution",
    "hjres":   "house-joint-resolution",
    "sjres":   "senate-joint-resolution",
    "hconres": "house-concurrent-resolution",
    "sconres": "senate-concurrent-resolution",
}


def _congress_ordinal(congress: int) -> str:
    """118 → '118th', 119 → '119th'"""
    if 11 <= (congress % 100) <= 13:
        return f"{congress}th"
    suffix = {1: "st", 2: "nd", 3: "rd"}.get(congress % 10, "th")
    return f"{congress}{suffix}"


def _build_congress_gov_url(congress: int, bill_type: str, number: str) -> str:
    path = _BILL_TYPE_TO_PATH.get(bill_type.lower(), f"{bill_type.lower()}-bill")
    ordinal = _congress_ordinal(congress)
    return f"https://www.congress.gov/bill/{ordinal}-congress/{path}/{number}"


def _format_bill_number(bill_type: str, number: str | int) -> str:
    """Format display bill number: 'S. 1247', 'H.R. 4521', etc."""
    fmt = {
        "s":    f"S. {number}",
        "hr":   f"H.R. {number}",
        "hjres": f"H.J.Res. {number}",
        "sjres": f"S.J.Res. {number}",
        "hconres": f"H.Con.Res. {number}",
        "sconres": f"S.Con.Res. {number}",
        "hres": f"H.Res. {number}",
        "sres": f"S.Res. {number}",
    }
    return fmt.get(bill_type.lower(), f"{bill_type.upper()} {number}")


def _extract_sponsor(detail: dict) -> dict:
    sponsors = detail.get("sponsors", [])
    if not sponsors:
        return {}
    s = sponsors[0]
    full_name = s.get("fullName") or f"{s.get('firstName', '')} {s.get('lastName', '')}".strip()
    return {
        "name":        full_name,
        "bioguide_id": s.get("bioguideId"),
        "party":       s.get("party"),
    }


def _extract_subjects(detail: dict) -> list[str]:
    subjects_block = detail.get("subjects", {})
    if isinstance(subjects_block, dict):
        items = subjects_block.get("legislativeSubjects", [])
        policy = (detail.get("policyArea") or {}).get("name")
        names = [i.get("name", "") for i in items if i.get("name")]
        if policy:
            names.insert(0, policy)
        return names
    return []


def _subjects_to_slugs(subjects: list[str]) -> list[str]:
    slugs = []
    seen = set()
    for s in subjects:
        slug = TOPIC_SLUG_MAP.get(s.lower())
        if slug and slug not in seen:
            slugs.append(slug)
            seen.add(slug)
    return slugs


def _derive_status(action_text: str, detail: dict) -> str:
    lower = action_text.lower()
    for keyword, status in BILL_STATUS_RULES:
        if keyword in lower:
            return status
    return "Active"


def _clean_html(text: str) -> str:
    """Strip HTML tags from bill summary text."""
    if not text:
        return text
    return re.sub(r"<[^>]+>", " ", text).strip()


