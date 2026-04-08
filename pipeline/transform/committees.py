"""
Transform FEC cm{yy}.txt → fec_committees DB rows.
No header row — uses CM_COLS from config.
"""

from __future__ import annotations


def transform_committee(record: dict) -> dict | None:
    cmte_id = record.get("cmte_id", "").strip()
    if not cmte_id:
        return None

    return {
        "cmte_id":              cmte_id,
        "cmte_nm":              record.get("cmte_nm", "").strip() or None,
        "cmte_dsgn":            record.get("cmte_dsgn", "").strip() or None,
        "cmte_tp":              record.get("cmte_tp", "").strip() or None,
        "cmte_pty_affiliation": record.get("cmte_pty_affiliation", "").strip() or None,
        "cmte_filing_freq":     record.get("cmte_filing_freq", "").strip() or None,
        "org_tp":               record.get("org_tp", "").strip() or None,
        "connected_org_nm":     record.get("connected_org_nm", "").strip() or None,
        "cand_id":              record.get("cand_id", "").strip() or None,
    }


def transform_committees_batch(records: list[dict]) -> list[dict]:
    rows = []
    for r in records:
        row = transform_committee(r)
        if row:
            rows.append(row)
    return rows
