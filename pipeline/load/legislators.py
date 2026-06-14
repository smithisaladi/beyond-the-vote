"""Transform congress-legislators YAML records and upload to Supabase."""
import structlog

from shared.db import upsert

log = structlog.get_logger()

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
    "AS": "American Samoa", "GU": "Guam", "MP": "Northern Mariana Islands",
    "PR": "Puerto Rico", "VI": "Virgin Islands",
}

_CHAMBER_MAP = {"rep": "House", "sen": "Senate"}
_PARTY_MAP = {
    "Democrat": "Democrat",
    "Republican": "Republican",
    "Independent": "Independent",
    "Libertarian": "Independent",
    "Green": "Independent",
}


def transform_legislator(record: dict, in_office: bool) -> dict | None:
    """Transform a single congress-legislators YAML record to a DB row."""
    ids = record.get("id", {})
    bioguide = ids.get("bioguide")
    if not bioguide:
        return None

    terms = record.get("terms", [])
    if not terms:
        return None
    last_term = terms[-1]

    name = record.get("name", {})
    bio = record.get("bio", {})
    term_type = last_term.get("type", "")
    chamber = _CHAMBER_MAP.get(term_type, term_type)
    party_raw = last_term.get("party", "Independent")
    state = last_term.get("state", "")

    title = "Senator" if term_type == "sen" else "Representative"

    return {
        "bioguide_id": bioguide,
        "lis_id": ids.get("lis"),
        "icpsr_id": ids.get("icpsr"),
        "govtrack_id": str(ids["govtrack"]) if ids.get("govtrack") else None,
        "thomas_id": ids.get("thomas"),
        "fec_ids": ids.get("fec", []),
        "first_name": name.get("first", ""),
        "last_name": name.get("last", ""),
        "full_name": name.get("official_full") or f"{name.get('first', '')} {name.get('last', '')}",
        "party": _PARTY_MAP.get(party_raw, "Independent"),
        "chamber": chamber,
        "state": state,
        "state_full": _STATE_NAMES.get(state, state),
        "district": last_term.get("district"),
        "title": title,
        "in_office": in_office,
        "birthday": bio.get("birthday"),
        "gender": bio.get("gender"),
        "website": last_term.get("url"),
        "phone": last_term.get("phone"),
        "address": last_term.get("address"),
        "photo_url": f"https://bioguide.congress.gov/bioguide/photo/{bioguide[0]}/{bioguide}.jpg",
        "term_start": last_term.get("start"),
        "term_end": last_term.get("end"),
        "senate_class": last_term.get("class"),
        "next_election": _next_election_year(last_term),
        "twitter": record.get("social", {}).get("twitter") if "social" in record else None,
        "facebook": record.get("social", {}).get("facebook") if "social" in record else None,
        "youtube": record.get("social", {}).get("youtube") if "social" in record else None,
        "fec_committee_id": None,
        "raw_json": record,
    }


def _next_election_year(term: dict) -> int | None:
    end = term.get("end")
    if not end:
        return None
    try:
        return int(end[:4])
    except (ValueError, TypeError):
        return None


def transform_committee_membership(
    committee_id: str,
    members: list[dict],
) -> list[dict]:
    """Transform committee membership entries for one committee."""
    rows = []
    for member in members:
        bioguide = member.get("bioguide")
        if not bioguide:
            continue
        rows.append({
            "bioguide_id": bioguide,
            "committee_id": committee_id,
            "rank": member.get("rank"),
            "role": member.get("title"),
        })
    return rows


_CHAMBER_TYPE_MAP = {"house": "House", "senate": "Senate", "joint": "Joint"}


def transform_committees(raw: list[dict]) -> list[dict]:
    """Transform committees-current.yaml entries into congress.committees rows.

    Each top-level entry becomes one row; each subcommittee becomes a row with
    thomas_id = parent_thomas_id + subcommittee_thomas_id (e.g. SSAF + 13 → SSAF13).
    """
    rows = []
    for entry in raw:
        parent_id = entry.get("thomas_id", "").strip()
        if not parent_id:
            continue
        chamber = _CHAMBER_TYPE_MAP.get(entry.get("type", ""), entry.get("type", ""))
        rows.append({
            "thomas_id": parent_id,
            "name": entry.get("name", "").strip(),
            "chamber": chamber,
            "committee_type": "committee",
            "parent_id": None,
            "url": entry.get("url"),
        })
        for sub in entry.get("subcommittees", []):
            sub_suffix = str(sub.get("thomas_id", "")).strip()
            if not sub_suffix:
                continue
            rows.append({
                "thomas_id": parent_id + sub_suffix,
                "name": sub.get("name", "").strip(),
                "chamber": chamber,
                "committee_type": "subcommittee",
                "parent_id": parent_id,
                "url": None,
            })
    return rows


def load_committees(raw: list[dict]) -> int:
    """Transform and upload committee metadata to congress.committees."""
    rows = transform_committees(raw)
    log.info("committees_transformed", total=len(rows))
    return upsert("committees", rows, on_conflict="thomas_id", schema="congress")


def load_legislators(current: list[dict], historical: list[dict]) -> int:
    """Transform and upload all legislators to congress.legislators."""
    rows = []
    for record in current:
        row = transform_legislator(record, in_office=True)
        if row:
            rows.append(row)
    for record in historical:
        row = transform_legislator(record, in_office=False)
        if row:
            rows.append(row)
    log.info("legislators_transformed", total=len(rows))
    return upsert("legislators", rows, on_conflict="bioguide_id", schema="congress")


def load_committee_memberships(memberships: dict[str, list[dict]]) -> int:
    """Transform and upload committee memberships."""
    all_rows = []
    for committee_id, members in memberships.items():
        all_rows.extend(transform_committee_membership(committee_id, members))
    log.info("committee_memberships_transformed", total=len(all_rows))
    return upsert("committee_memberships", all_rows, on_conflict="bioguide_id,committee_id", schema="congress")
