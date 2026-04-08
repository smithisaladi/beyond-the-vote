"""
Transform FEC ccl{yy}.txt → in-memory lookup dict.
ccl links cand_id to their principal campaign committee_id.
This data is NOT loaded as a separate DB table — it's used to enrich
candidates and build the committee-to-legislator filter set.
"""

from __future__ import annotations

import logging

from config import CCL_COLS

log = logging.getLogger(__name__)


def build_cand_to_cmte(records: list[dict]) -> dict[str, str]:
    """
    Build a dict of {cand_id: cmte_id} from CCL records.
    Only principal campaign committees (cmte_dsgn='P') are included.
    If multiple entries exist per candidate, last one wins.
    """
    mapping: dict[str, str] = {}
    for r in records:
        cand_id = r.get("cand_id", "").strip()
        cmte_id = r.get("cmte_id", "").strip()
        dsgn = r.get("cmte_dsgn", "").strip().upper()
        if cand_id and cmte_id and dsgn == "P":
            mapping[cand_id] = cmte_id
    log.info("CCL: mapped %d cand_id → cmte_id (principal only)", len(mapping))
    return mapping
