"""
Transform FEC pas2{yy}.txt rows with transaction_tp IN ('24E','24A') → independent_expenditures DB rows.

24E = independent expenditure FOR candidate  → sup_opp = 'S'
24A = independent expenditure AGAINST candidate → sup_opp = 'O'
"""

from __future__ import annotations

from config import IE_FOR_TP, IE_AGAINST_TP
from utils import safe_numeric, safe_int

IE_TYPES = {IE_FOR_TP, IE_AGAINST_TP}
SUP_OPP_MAP = {IE_FOR_TP: "S", IE_AGAINST_TP: "O"}


def transform_independent_expenditure(record: dict, cycle: int) -> dict | None:
    """
    Convert a pas2 record that is an independent expenditure to an independent_expenditures row.
    Returns None if not an IE type or missing required fields.
    """
    transaction_tp = record.get("transaction_tp", "").strip().upper()
    if transaction_tp not in IE_TYPES:
        return None

    sub_id = safe_int(record.get("sub_id", "").strip())
    if not sub_id:
        return None

    cmte_id = record.get("cmte_id", "").strip()
    if not cmte_id:
        return None

    amt = safe_numeric(record.get("transaction_amt", ""))
    if amt is None:
        return None

    return {
        "sub_id":          sub_id,
        "cmte_id":         cmte_id,
        "cand_id":         record.get("cand_id", "").strip() or None,
        "sup_opp":         SUP_OPP_MAP[transaction_tp],
        "transaction_tp":  transaction_tp,
        "transaction_amt": amt,
        "transaction_dt":  record.get("transaction_dt", "").strip() or None,
        "cycle":           cycle,
    }


def transform_independent_expenditures_batch(records: list[dict], cycle: int) -> list[dict]:
    rows = []
    for r in records:
        row = transform_independent_expenditure(r, cycle)
        if row:
            rows.append(row)
    return rows
