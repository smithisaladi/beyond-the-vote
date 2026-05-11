"""Transform usc-run vote JSON to congress.bill_vote_summaries and positions."""
import structlog
from shared.db import upsert
from load.bills import make_bill_id

log = structlog.get_logger()

_CHAMBER_MAP = {"h": "House", "s": "Senate"}
_POSITION_MAP = {
    "yea": "Yea", "aye": "Yea", "yes": "Yea",
    "nay": "Nay", "no": "Nay",
    "present": "Present",
    "not voting": "Not Voting",
}
_PARTY_MAP = {"D": "Democrat", "R": "Republican", "I": "Independent"}


def transform_vote(data: dict) -> dict | None:
    chamber_code = data.get("chamber", "")
    congress = data.get("congress")
    number = data.get("number")
    if not number or not congress:
        return None

    chamber = _CHAMBER_MAP.get(chamber_code, chamber_code)
    session = data.get("session", "")
    vote_id = f"{chamber.lower()}-{congress}-{session}-{number}"

    bill = data.get("bill")
    bill_id = None
    if bill:
        bill_type = bill.get("type", "").lower()
        bill_number = bill.get("number")
        if bill_type and bill_number:
            bill_id = make_bill_id(congress, bill_type, bill_number)

    votes_by_position = data.get("votes", {})
    yea_total = len(votes_by_position.get("Yea", []) + votes_by_position.get("Aye", []))
    nay_total = len(votes_by_position.get("Nay", []) + votes_by_position.get("No", []))
    present_total = len(votes_by_position.get("Present", []))
    not_voting_total = len(votes_by_position.get("Not Voting", []))

    party_counts = _count_by_party(votes_by_position)
    date_raw = data.get("date", "")
    vote_date = date_raw[:10] if date_raw else None

    return {
        "id": vote_id,
        "bill_id": bill_id,
        "congress": congress,
        "chamber": chamber,
        "date": vote_date,
        "question": data.get("question"),
        "result": data.get("result") or data.get("result_text", ""),
        "title": data.get("question"),
        "required": data.get("requires"),
        "yea_total": yea_total,
        "nay_total": nay_total,
        "present_total": present_total,
        "not_voting_total": not_voting_total,
        "yea_democrat": party_counts.get("yea_democrat", 0),
        "nay_democrat": party_counts.get("nay_democrat", 0),
        "yea_republican": party_counts.get("yea_republican", 0),
        "nay_republican": party_counts.get("nay_republican", 0),
        "yea_independent": party_counts.get("yea_independent", 0),
        "nay_independent": party_counts.get("nay_independent", 0),
        "source_url": None,
    }


def _count_by_party(votes_by_position: dict) -> dict:
    counts = {}
    for position, voters in votes_by_position.items():
        pos_key = position.lower().replace(" ", "_")
        if pos_key in ("yea", "aye"):
            pos_key = "yea"
        elif pos_key in ("nay", "no"):
            pos_key = "nay"
        else:
            continue
        for voter in voters:
            if not isinstance(voter, dict):
                continue
            party_raw = voter.get("party", "")
            party = _PARTY_MAP.get(party_raw, "independent").lower()
            key = f"{pos_key}_{party}"
            counts[key] = counts.get(key, 0) + 1
    return counts


def transform_positions(data: dict, vote_id: str) -> list[dict]:
    positions = []
    votes_by_position = data.get("votes", {})
    for position_label, voters in votes_by_position.items():
        normalized = _POSITION_MAP.get(position_label.lower(), position_label)
        for voter in voters:
            if not isinstance(voter, dict):
                continue
            bioguide = voter.get("id")
            if not bioguide:
                continue
            positions.append({"vote_id": vote_id, "bioguide_id": bioguide, "position": normalized})
    return positions


def _build_lis_to_bioguide() -> dict[str, str]:
    """Build LIS ID → bioguide_id mapping for Senate vote resolution."""
    from shared.db import get_conn
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT lis_id, bioguide_id FROM congress.legislators WHERE lis_id IS NOT NULL")
    return {r[0]: r[1] for r in cur.fetchall()}


def load_votes(vote_jsons: list[dict]) -> tuple[int, int]:
    summaries = []
    all_positions = []
    seen_vote_ids = set()
    seen_position_keys = set()

    # Build LIS → bioguide map for Senate vote resolution
    lis_to_bioguide = _build_lis_to_bioguide()

    for data in vote_jsons:
        summary = transform_vote(data)
        if not summary:
            continue
        if summary["id"] in seen_vote_ids:
            continue
        seen_vote_ids.add(summary["id"])
        summaries.append(summary)

        is_senate = data.get("chamber", "") == "s"
        positions = transform_positions(data, summary["id"])

        for pos in positions:
            # Senate votes from usc-run use LIS IDs — resolve to bioguide
            if is_senate and pos["bioguide_id"] in lis_to_bioguide:
                pos["bioguide_id"] = lis_to_bioguide[pos["bioguide_id"]]

            key = (pos["vote_id"], pos["bioguide_id"])
            if key not in seen_position_keys:
                seen_position_keys.add(key)
                all_positions.append(pos)

    log.info("votes_transformed", summaries=len(summaries), positions=len(all_positions))
    s_count = upsert("bill_vote_summaries", summaries, on_conflict="id", schema="congress")

    # Filter positions to only include known legislators (FK constraint)
    from shared.db import get_conn
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT bioguide_id FROM congress.legislators")
    valid_ids = {r[0] for r in cur.fetchall()}
    filtered_positions = [p for p in all_positions if p["bioguide_id"] in valid_ids]
    skipped = len(all_positions) - len(filtered_positions)
    if skipped > 0:
        log.info("positions_filtered", total=len(all_positions), kept=len(filtered_positions), skipped=skipped)

    p_count = upsert("bill_vote_positions", filtered_positions, on_conflict="vote_id,bioguide_id", schema="congress")
    return s_count, p_count
