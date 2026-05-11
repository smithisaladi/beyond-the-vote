"""Transform VoteView scores and upload to congress.member_scores."""
import structlog
from shared.db import upsert

log = structlog.get_logger()

def transform_member_score(record: dict, icpsr_to_bioguide: dict[str, str]) -> dict | None:
    icpsr = str(record.get("icpsr", "")).strip()
    bioguide = icpsr_to_bioguide.get(icpsr)
    if not bioguide:
        return None
    congress = record.get("congress")
    if not congress:
        return None
    try:
        dim1 = float(record["nominate_dim1"]) if record.get("nominate_dim1") else None
        dim2 = float(record["nominate_dim2"]) if record.get("nominate_dim2") else None
    except (ValueError, TypeError):
        return None
    return {"bioguide_id": bioguide, "congress": int(congress), "nominate_dim1": dim1, "nominate_dim2": dim2}

def load_scores(records: list[dict], icpsr_to_bioguide: dict[str, str]) -> int:
    rows = []
    seen = set()
    for rec in records:
        row = transform_member_score(rec, icpsr_to_bioguide)
        if row:
            key = (row["bioguide_id"], row["congress"])
            if key not in seen:
                seen.add(key)
                rows.append(row)
    log.info("member_scores_transformed", total=len(rows))
    return upsert("member_scores", rows, on_conflict="bioguide_id,congress", schema="congress")
