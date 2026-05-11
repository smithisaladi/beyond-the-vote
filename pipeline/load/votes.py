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
    vote_id = f"{chamber.lower()}-{congress}-{number}"

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
            bioguide = voter.get("id")
            if not bioguide:
                continue
            positions.append({"vote_id": vote_id, "bioguide_id": bioguide, "position": normalized})
    return positions


def load_votes(vote_jsons: list[dict]) -> tuple[int, int]:
    summaries = []
    all_positions = []
    for data in vote_jsons:
        summary = transform_vote(data)
        if not summary:
            continue
        summaries.append(summary)
        positions = transform_positions(data, summary["id"])
        all_positions.extend(positions)
    log.info("votes_transformed", summaries=len(summaries), positions=len(all_positions))
    s_count = upsert("bill_vote_summaries", summaries, on_conflict="id", schema="congress")
    p_count = upsert("bill_vote_positions", all_positions, on_conflict="vote_id,bioguide_id", schema="congress")
    return s_count, p_count
