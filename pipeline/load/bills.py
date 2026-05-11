"""Transform usc-run bill JSON to congress.bills rows and upload."""
import re

import structlog

from shared.db import upsert

log = structlog.get_logger()

_TOPIC_SLUG_MAP = {
    "Agriculture and Food": "agriculture",
    "Armed Forces and National Security": "defense",
    "Civil Rights and Liberties, Minority Issues": "civil-rights",
    "Commerce": "economy",
    "Congress": "government",
    "Crime and Law Enforcement": "criminal-justice",
    "Economics and Public Finance": "economy",
    "Education": "education",
    "Emergency Management": "defense",
    "Energy": "climate-environment",
    "Environmental Protection": "climate-environment",
    "Families": "healthcare",
    "Finance and Financial Sector": "economy",
    "Foreign Trade and International Finance": "foreign-policy",
    "Government Operations and Politics": "government",
    "Health": "healthcare",
    "Housing and Community Development": "economy",
    "Immigration": "immigration",
    "International Affairs": "foreign-policy",
    "Labor and Employment": "economy",
    "Law": "criminal-justice",
    "Native Americans": "civil-rights",
    "Public Lands and Natural Resources": "climate-environment",
    "Science, Technology, Communications": "technology",
    "Social Welfare": "healthcare",
    "Sports and Recreation": "education",
    "Taxation": "economy",
    "Transportation and Public Works": "infrastructure",
    "Water Resources Development": "infrastructure",
}

_BILL_TYPE_DISPLAY = {
    "hr": "H.R.", "s": "S.", "hjres": "H.J.Res.", "sjres": "S.J.Res.",
    "hconres": "H.Con.Res.", "sconres": "S.Con.Res.", "hres": "H.Res.", "sres": "S.Res.",
}

_STATUS_RULES = [
    ("became public law", "Passed"),
    ("signed by president", "Passed"),
    ("passed the house", "Passed"),
    ("passed the senate", "Passed"),
    ("passed senate", "Passed"),
    ("failed", "Failed"),
    ("vetoed", "Failed"),
    ("referred to", "Committee"),
    ("tabled", "Stalled"),
]


def make_bill_id(congress: int, bill_type: str, number: int | str) -> str:
    return f"{congress}-{bill_type.lower()}-{number}"


def transform_bill(data: dict) -> dict | None:
    congress_raw = data.get("congress")
    bill_type = data.get("bill_type", "").lower()
    number = data.get("number")

    if not congress_raw or not number:
        return None

    congress = int(congress_raw)
    bill_id = make_bill_id(congress, bill_type, number)
    bill_number = f"{_BILL_TYPE_DISPLAY.get(bill_type, bill_type.upper())} {number}"

    title = data.get("short_title") or data.get("official_title") or ""

    summary_obj = data.get("summary")
    summary = None
    if isinstance(summary_obj, dict):
        summary = _clean_html(summary_obj.get("text", ""))
    elif isinstance(summary_obj, str):
        summary = _clean_html(summary_obj)

    sponsor = data.get("sponsor") or {}
    sponsor_name = sponsor.get("name")
    sponsor_bioguide = sponsor.get("bioguide_id")
    sponsor_party_raw = sponsor.get("party", "")
    sponsor_party = {"D": "Democrat", "R": "Republican", "I": "Independent"}.get(
        sponsor_party_raw, sponsor_party_raw
    )

    actions = data.get("actions", [])
    last_action_text = actions[-1].get("text", "") if actions else ""
    last_action_date = actions[-1].get("acted_at") if actions else None
    status = _derive_status(last_action_text, data)

    subjects = data.get("subjects", [])
    top_term = data.get("subjects_top_term")
    if top_term and top_term not in subjects:
        subjects.insert(0, top_term)
    topics = list(dict.fromkeys(
        _TOPIC_SLUG_MAP[s] for s in subjects if s in _TOPIC_SLUG_MAP
    ))

    return {
        "bill_id": bill_id,
        "bill_number": bill_number,
        "bill_type": bill_type,
        "congress": congress,
        "title": title,
        "summary": summary,
        "combined_text": None,
        "status": status,
        "introduced_date": data.get("introduced_at"),
        "policy_area": top_term,
        "sponsor_name": sponsor_name,
        "sponsor_bioguide_id": sponsor_bioguide,
        "sponsor_party": sponsor_party,
        "last_action_text": last_action_text or None,
        "last_action_date": last_action_date,
        "congress_gov_url": _build_url(congress, bill_type, number),
        "topics": topics,
        "referenced_agencies": [],
        "referenced_laws": [],
        "referenced_usc": [],
    }


def _derive_status(action_text: str, data: dict) -> str:
    text_lower = action_text.lower()
    history = data.get("history", {})

    if history.get("enacted"):
        return "Passed"
    if history.get("vetoed"):
        return "Failed"

    for pattern, status in _STATUS_RULES:
        if pattern in text_lower:
            if status == "Committee":
                introduced = data.get("introduced_at", "")
                if introduced and _months_since(introduced) > 18:
                    return "Stalled"
            return status
    return "Active"


def _months_since(date_str: str) -> int:
    from datetime import date
    try:
        d = date.fromisoformat(date_str)
        today = date.today()
        return (today.year - d.year) * 12 + (today.month - d.month)
    except (ValueError, TypeError):
        return 0


def _build_url(congress: int | str, bill_type: str, number: int | str) -> str:
    congress = int(congress)
    type_path = {
        "hr": "house-bill", "s": "senate-bill",
        "hjres": "house-joint-resolution", "sjres": "senate-joint-resolution",
        "hconres": "house-concurrent-resolution", "sconres": "senate-concurrent-resolution",
        "hres": "house-resolution", "sres": "senate-resolution",
    }.get(bill_type, bill_type)
    ordinal = f"{congress}th" if congress % 10 not in (1, 2, 3) or congress in (11, 12, 13) else (
        f"{congress}st" if congress % 10 == 1 else f"{congress}nd" if congress % 10 == 2 else f"{congress}rd"
    )
    return f"https://www.congress.gov/bill/{ordinal}-congress/{type_path}/{number}"


def _clean_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text).strip()


def load_bills(bill_jsons: list[dict]) -> int:
    rows = []
    for data in bill_jsons:
        row = transform_bill(data)
        if row:
            rows.append(row)
    log.info("bills_transformed", total=len(rows))

    # Null out sponsor FKs that don't exist in legislators table (current-only DB)
    from shared.db import get_supabase
    client = get_supabase()
    result = client.schema("congress").table("legislators").select("bioguide_id").execute()
    valid_ids = {r["bioguide_id"] for r in result.data}
    nulled = 0
    for row in rows:
        if row.get("sponsor_bioguide_id") and row["sponsor_bioguide_id"] not in valid_ids:
            row["sponsor_bioguide_id"] = None
            nulled += 1
    if nulled:
        log.info("sponsor_fks_nulled", count=nulled)

    return upsert("bills", rows, on_conflict="bill_id", schema="congress")
