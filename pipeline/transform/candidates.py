"""
Transform FEC cn{yy}.txt → candidates DB rows.
No header row — uses CN_COLS from config.
"""

from __future__ import annotations

from config import CN_COLS
from utils import safe_int


def transform_candidate(record: dict, cycle: int) -> dict | None:
    """
    Convert a single FEC candidate record to a candidates DB row.
    Only H (House), S (Senate), P (President) offices are included.
    """
    cand_id = record.get("cand_id", "").strip()
    if not cand_id:
        return None

    office = record.get("cand_office", "").strip().upper()
    if office not in ("H", "S", "P"):
        return None

    return {
        "cand_id":            cand_id,
        "cand_name":          record.get("cand_name", "").strip() or None,
        "cand_pty_affiliation": record.get("cand_pty_affiliation", "").strip() or None,
        "cand_election_yr":   safe_int(record.get("cand_election_yr")),
        "cand_office_st":     record.get("cand_office_st", "").strip() or None,
        "cand_office":        office,
        "cand_office_district": record.get("cand_office_district", "").strip() or None,
        "cand_ici":           record.get("cand_ici", "").strip() or None,
        "cand_status":        record.get("cand_status", "").strip() or None,
        "cand_pcc":           record.get("cand_pcc", "").strip() or None,
        "cycle":              cycle,
    }


def transform_candidates_batch(records: list[dict], cycle: int) -> list[dict]:
    rows = []
    for r in records:
        row = transform_candidate(r, cycle)
        if row:
            rows.append(row)
    return rows
