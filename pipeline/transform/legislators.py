"""
Transform legislators YAML → legislators + committee_memberships DB rows.
"""

from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger(__name__)

CHAMBER_MAP = {"rep": "House", "sen": "Senate"}
PARTY_MAP = {
    "Democrat": "Democrat",
    "Republican": "Republican",
    "Independent": "Independent",
    "Libertarian": "Independent",
    "Green": "Independent",
}

TITLE_MAP = {
    ("rep", "House"): "Representative",
    ("sen", "Senate"): "Senator",
}


def transform_legislator(record: dict, in_office: bool) -> dict | None:
    """
    Convert a single congress-legislators YAML record to a legislators DB row.
    Returns None if the record is missing required fields.
    """
    ids = record.get("id", {})
    bioguide_id = ids.get("bioguide")
    if not bioguide_id:
        log.warning("Skipping record with no bioguide_id: %s", record.get("name"))
        return None

    name = record.get("name", {})
    bio = record.get("bio", {})
    terms = record.get("terms", [])
    social = record.get("social", {})

    if not terms:
        log.warning("Skipping %s — no terms.", bioguide_id)
        return None

    last_term = terms[-1]
    term_type = last_term.get("type", "")
    chamber = CHAMBER_MAP.get(term_type, term_type.capitalize())
    party_raw = last_term.get("party", "")
    party = PARTY_MAP.get(party_raw, party_raw or "Independent")

    full_name = name.get("official_full") or f"{name.get('first', '')} {name.get('last', '')}".strip()

    row: dict[str, Any] = {
        "bioguide_id": bioguide_id,
        "lis_id":      ids.get("lis"),
        "icpsr_id":    ids.get("icpsr"),
        "fec_ids":     ids.get("fec") or [],
        "govtrack_id": str(ids["govtrack"]) if ids.get("govtrack") else None,
        "thomas_id":   str(ids["thomas"]) if ids.get("thomas") else None,

        "first_name": name.get("first", ""),
        "last_name":  name.get("last", ""),
        "full_name":  full_name,
        "party":      party,
        "chamber":    chamber,
        "state":      last_term.get("state", ""),
        "state_full": _state_full(last_term.get("state", "")),
        "district":   last_term.get("district"),
        "title":      "Representative" if term_type == "rep" else "Senator",
        "in_office":  in_office,

        "birthday": str(bio["birthday"]) if bio.get("birthday") else None,
        "gender":   bio.get("gender"),

        "website": last_term.get("url"),
        "phone":   last_term.get("phone"),
        "address": last_term.get("address"),

        "term_start":    last_term.get("start"),
        "term_end":      last_term.get("end"),
        "senate_class":  last_term.get("class"),
        "next_election": last_term.get("end", "")[:4] and int(last_term.get("end", "")[:4]) if last_term.get("end") else None,

        "twitter":  social.get("twitter"),
        "facebook": social.get("facebook"),
        "youtube":  social.get("youtube"),

        "raw_json": record,
    }

    # Photo URL: use unitedstates/images convention
    row["photo_url"] = f"https://bioguide.congress.gov/bioguide/photo/{bioguide_id[0]}/{bioguide_id}.jpg"

    return row


def extract_committee_memberships(record: dict) -> list[dict]:
    """
    Extract committee_memberships rows from the last term of a legislator record.
    Returns a list of {bioguide_id, committee_id, title} dicts.
    """
    bioguide_id = record.get("id", {}).get("bioguide")
    if not bioguide_id:
        return []

    terms = record.get("terms", [])
    if not terms:
        return []

    memberships = []
    committees = terms[-1].get("committees", [])
    for c in committees:
        thomas_id = c.get("thomas_id") or c.get("id")
        if thomas_id:
            memberships.append({
                "bioguide_id":   bioguide_id,
                "committee_id":  thomas_id,
                "title":         c.get("title"),
            })
    return memberships


# ── State lookup ──────────────────────────────────────────────────────────────

_STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
    "PR": "Puerto Rico", "GU": "Guam", "VI": "Virgin Islands",
    "AS": "American Samoa", "MP": "Northern Mariana Islands",
}


def _state_full(abbr: str) -> str:
    return _STATE_NAMES.get(abbr.upper(), abbr)
