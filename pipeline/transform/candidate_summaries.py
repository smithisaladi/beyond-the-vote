"""
Transform FEC webl{yy}.txt → candidate_summaries CSV rows.
No header row — uses WEBL_COLS from config.
"""

from __future__ import annotations

from utils import safe_numeric


def transform_candidate_summary(record: dict, cycle: int) -> dict | None:
    cand_id = record.get("cand_id", "").strip()
    if not cand_id:
        return None

    # Only House (H) and Senate (S) candidates — skip Presidential (P)
    office_code = cand_id[0].upper()
    if office_code not in ("H", "S"):
        return None

    return {
        "cand_id":                cand_id,
        "cand_name":              record.get("cand_name", "").strip() or None,
        "ttl_receipts":           safe_numeric(record.get("ttl_receipts")),
        "ttl_indiv_contrib":      safe_numeric(record.get("ttl_indiv_contrib")),
        "other_pol_cmte_contrib": safe_numeric(record.get("other_pol_cmte_contrib")),
        "pol_pty_contrib":        safe_numeric(record.get("pol_pty_contrib")),
        "cand_contrib":           safe_numeric(record.get("cand_contrib")),
        "cand_office_st":         record.get("cand_office_st", "").strip() or None,
        "cand_office_district":   record.get("cand_office_district", "").strip() or None,
        "cycle":                  cycle,
    }


def transform_candidate_summaries_batch(records: list[dict], cycle: int) -> list[dict]:
    rows = []
    for r in records:
        row = transform_candidate_summary(r, cycle)
        if row:
            rows.append(row)
    return rows
