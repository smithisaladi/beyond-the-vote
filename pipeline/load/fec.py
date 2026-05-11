"""Transform FEC Parquet data and upload aggregations to Supabase."""
from pathlib import Path
import structlog
from shared.db import upsert
from shared.parquet import duckdb_connect

log = structlog.get_logger()

PAC_DIRECT_TPS = {"24K", "24Z"}
IE_FOR_TP = "24E"
IE_AGAINST_TP = "24A"


def _safe_str(val) -> str:
    """Safely convert any value to a stripped string. Handles NaN, None, float."""
    if val is None:
        return ""
    s = str(val).strip()
    if s.lower() in ("nan", "none"):
        return ""
    return s


def transform_pac_contribution(record: dict, cycle: int) -> dict | None:
    tp = _safe_str(record.get("transaction_tp"))
    if tp not in PAC_DIRECT_TPS:
        return None
    sub_id = _safe_int(record.get("sub_id"))
    cmte_id = _safe_str(record.get("cmte_id"))
    amt = _safe_numeric(record.get("transaction_amt"))
    if not sub_id or not cmte_id or amt is None:
        return None
    cand_id = _safe_str(record.get("cand_id")) or None
    transaction_dt = _safe_str(record.get("transaction_dt")) or None
    return {"sub_id": sub_id, "cmte_id": cmte_id, "cand_id": cand_id, "transaction_tp": tp, "transaction_amt": amt, "transaction_dt": transaction_dt, "cycle": cycle}


def transform_ie_contribution(record: dict, cycle: int) -> dict | None:
    tp = _safe_str(record.get("transaction_tp"))
    if tp not in (IE_FOR_TP, IE_AGAINST_TP):
        return None
    sub_id = _safe_int(record.get("sub_id"))
    cmte_id = _safe_str(record.get("cmte_id"))
    amt = _safe_numeric(record.get("transaction_amt"))
    if not sub_id or not cmte_id or amt is None:
        return None
    sup_opp = "S" if tp == IE_FOR_TP else "O"
    cand_id = _safe_str(record.get("cand_id")) or None
    transaction_dt = _safe_str(record.get("transaction_dt")) or None
    return {"sub_id": sub_id, "cmte_id": cmte_id, "cand_id": cand_id, "sup_opp": sup_opp, "transaction_tp": tp, "transaction_amt": amt, "transaction_dt": transaction_dt, "cycle": cycle}

def load_pac_contributions(parquet_path: Path, cycle: int) -> int:
    from shared.parquet import read_parquet_batched
    total = 0
    for batch in read_parquet_batched(parquet_path):
        rows = [r for r in (transform_pac_contribution(rec, cycle) for rec in batch) if r]
        if rows:
            upsert("pac_to_candidate", rows, on_conflict="sub_id", schema="fec")
            total += len(rows)
    log.info("pac_contributions_loaded", cycle=cycle, rows=total)
    return total

def load_ie_contributions(parquet_path: Path, cycle: int) -> int:
    from shared.parquet import read_parquet_batched
    total = 0
    for batch in read_parquet_batched(parquet_path):
        rows = [r for r in (transform_ie_contribution(rec, cycle) for rec in batch) if r]
        if rows:
            upsert("independent_expenditures", rows, on_conflict="sub_id", schema="fec")
            total += len(rows)
    log.info("ie_contributions_loaded", cycle=cycle, rows=total)
    return total

def load_committee_names(parquet_path: Path) -> int:
    from shared.parquet import read_parquet_batched
    total = 0
    for batch in read_parquet_batched(parquet_path):
        rows = []
        for rec in batch:
            cmte_id = _safe_str(rec.get("cmte_id"))
            cmte_nm = _safe_str(rec.get("cmte_nm"))
            if not cmte_id or not cmte_nm:
                continue
            rows.append({"cmte_id": cmte_id, "cmte_name": cmte_nm, "connected_org": _safe_str(rec.get("connected_org_nm")) or None})
        if rows:
            upsert("cmte_names", rows, on_conflict="cmte_id", schema="fec")
            total += len(rows)
    log.info("committee_names_loaded", rows=total)
    return total

def _safe_int(val) -> int | None:
    try:
        return int(val)
    except (ValueError, TypeError):
        return None

def _safe_numeric(val) -> float | None:
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
