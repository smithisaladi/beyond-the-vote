"""
Transform FEC indiv{yy}.txt rows → individual_contributions DB rows.

CRITICAL: The indiv file is ~4GB unzipped. This module processes one row at a time
and is always called from a streaming context — never load the full file into memory.
"""

from __future__ import annotations

from utils import normalize_fec_date, safe_numeric, safe_int


# Only load contributions for these transaction types (direct contributions)
VALID_TRANSACTION_TYPES = {
    "15", "15E", "15J", "22Y",   # individual contributions
    "11",                          # tribal contributions
}


def transform_individual(record: dict, cycle: int, valid_cmte_ids: set[str]) -> dict | None:
    """
    Convert one FEC individual contribution record to a DB row.

    Args:
        record:          Dict with keys from INDIV_COLS.
        cycle:           Election cycle year.
        valid_cmte_ids:  Set of committee IDs linked to tracked legislators.
                         If empty set, all committees are included.

    Returns:
        DB row dict, or None if record should be filtered out.
    """
    cmte_id = record.get("cmte_id", "").strip()
    if not cmte_id:
        return None

    # Filter to tracked legislators' committees
    if valid_cmte_ids and cmte_id not in valid_cmte_ids:
        return None

    sub_id_raw = record.get("sub_id", "").strip()
    sub_id = safe_int(sub_id_raw)
    if not sub_id:
        return None

    amt = safe_numeric(record.get("transaction_amt", ""))
    if amt is None:
        return None

    return {
        "sub_id":          sub_id,
        "cmte_id":         cmte_id,
        "name":            record.get("name", "").strip() or None,
        "city":            record.get("city", "").strip() or None,
        "state":           record.get("state", "").strip() or None,
        "zip_code":        record.get("zip_code", "").strip()[:9] or None,
        "employer":        record.get("employer", "").strip() or None,
        "occupation":      record.get("occupation", "").strip() or None,
        "transaction_dt":  record.get("transaction_dt", "").strip() or None,
        "transaction_amt": amt,
        "cycle":           cycle,
    }


def transform_individuals_batch(
    records: list[dict],
    cycle: int,
    valid_cmte_ids: set[str],
) -> list[dict]:
    rows = []
    for r in records:
        row = transform_individual(r, cycle, valid_cmte_ids)
        if row:
            rows.append(row)
    return rows
