"""
Transform DW-NOMINATE CSV → member_scores DB rows.
VoteView CSV has headers. icpsr_id is the join key to legislators.
"""

from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger(__name__)

# VoteView chamber codes (integer format in older files)
CHAMBER_CODE_MAP = {100: "Senate", 200: "House", 10: "President"}
# VoteView chamber names (text format in newer files)
VALID_CHAMBERS = {"House", "Senate"}


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
        # Resolve bioguide_id: prefer CSV column, fall back to icpsr lookup
        bioguide_id = (r.get("bioguide_id") or "").strip() or None
        if not bioguide_id:
            try:
                icpsr = int(r.get("icpsr", 0) or 0)
            except (ValueError, TypeError):
                skipped += 1
                continue
            bioguide_id = icpsr_to_bioguide.get(icpsr)
        if not bioguide_id:
            skipped += 1
            continue

        # Resolve chamber: handle both text ("House") and integer code (200)
        raw_chamber = (r.get("chamber") or "").strip()
        if raw_chamber in VALID_CHAMBERS:
            chamber = raw_chamber
        else:
            chamber_code = _safe_int(raw_chamber)
            chamber = CHAMBER_CODE_MAP.get(chamber_code, "Unknown") if chamber_code else "Unknown"
        if chamber not in VALID_CHAMBERS:
            continue

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

    # Deduplicate by (bioguide_id, congress) — keep row with most votes
    seen: dict[str, dict] = {}
    for row in rows:
        key = row["bioguide_id"]
        prev = seen.get(key)
        if prev is None or (row.get("num_votes") or 0) > (prev.get("num_votes") or 0):
            seen[key] = row
    if len(seen) < len(rows):
        log.info("Deduplicated %d → %d rows (congress=%d)", len(rows), len(seen), congress)
    return list(seen.values())


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
