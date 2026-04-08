"""
Transform DW-NOMINATE CSV → member_scores DB rows.
VoteView CSV has headers. icpsr_id is the join key to legislators.
"""

from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger(__name__)

# VoteView chamber codes
CHAMBER_MAP = {100: "Senate", 200: "House", 10: "President"}


def transform_member_scores(
    df_rows: list[dict],
    congress: int,
    icpsr_to_bioguide: dict[int, str],
) -> list[dict]:
    """
    Convert VoteView CSV rows to member_scores DB rows.

    Args:
        df_rows:            List of dicts from CSV (headers lowercase).
        congress:           Congress number extracted from filename.
        icpsr_to_bioguide:  Mapping of icpsr_id → bioguide_id from legislators table.

    Returns:
        List of member_scores rows ready for upsert.
    """
    rows: list[dict] = []
    skipped = 0

    for r in df_rows:
        try:
            icpsr = int(r.get("icpsr", 0) or 0)
        except (ValueError, TypeError):
            skipped += 1
            continue

        bioguide_id = icpsr_to_bioguide.get(icpsr)
        if not bioguide_id:
            skipped += 1
            continue

        chamber_code = _safe_int(r.get("chamber"))
        chamber = CHAMBER_MAP.get(chamber_code, "Unknown") if chamber_code else "Unknown"
        if chamber == "Unknown" or chamber == "President":
            continue  # skip non-congressional entries

        rows.append({
            "bioguide_id":   bioguide_id,
            "congress":      congress,
            "chamber":       chamber,
            "nominate_dim1": _safe_float(r.get("nominate_dim1")),
            "nominate_dim2": _safe_float(r.get("nominate_dim2")),
            "num_votes":     _safe_int(r.get("numvotes") or r.get("num_votes")),
            "geo_mean_prob": _safe_float(r.get("geo_mean_probability") or r.get("geo_mean_prob")),
        })

    if skipped:
        log.warning("Skipped %d rows without bioguide_id mapping (congress=%d)", skipped, congress)

    return rows


def _safe_float(val: Any) -> float | None:
    try:
        return float(val) if val is not None and str(val).strip() != "" else None
    except (ValueError, TypeError):
        return None


def _safe_int(val: Any) -> int | None:
    try:
        return int(float(val)) if val is not None and str(val).strip() != "" else None
    except (ValueError, TypeError):
        return None
