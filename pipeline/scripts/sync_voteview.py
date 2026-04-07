"""
Syncs DW-NOMINATE ideology scores from VoteView for the 119th Congress.

Run: python pipeline/scripts/sync_voteview.py
"""
import sys
import time
import json
import csv
from io import StringIO
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import httpx
from pipeline.lib.supabase_client import create_service_client
from pipeline.lib.config import VOTEVIEW_MEMBERS_URL, TIMEOUT_DEFAULT, DEFAULT_CONGRESS


def sync_voteview() -> dict:
    start = time.time()
    supabase = create_service_client()

    print("Fetching VoteView members CSV...")
    resp = httpx.get(VOTEVIEW_MEMBERS_URL, timeout=TIMEOUT_DEFAULT, follow_redirects=True)
    resp.raise_for_status()

    reader = csv.DictReader(StringIO(resp.text))
    rows_to_upsert = []
    skipped = 0

    # Fetch existing legislators to filter
    leg_data = supabase.table("legislators").select("bioguide_id").execute()
    known_bioguides = {r["bioguide_id"] for r in (leg_data.data or [])}

    now = datetime.now(timezone.utc).isoformat()

    for row in reader:
        bioguide = (row.get("bioguide_id") or "").strip()
        if not bioguide or bioguide not in known_bioguides:
            skipped += 1
            continue

        congress = int(row.get("congress") or 0)
        if congress != DEFAULT_CONGRESS:
            continue

        chamber_raw = (row.get("chamber_code") or row.get("chamber") or "").lower()
        chamber = "senate" if "s" in chamber_raw else "house"

        def parse_float(val: str) -> float | None:
            try:
                return float(val) or None
            except (ValueError, TypeError):
                return None

        def parse_int(val: str) -> int | None:
            try:
                return int(val) or None
            except (ValueError, TypeError):
                return None

        rows_to_upsert.append({
            "bioguide_id":   bioguide,
            "congress":      DEFAULT_CONGRESS,
            "chamber":       chamber,
            "nominate_dim1": parse_float(row.get("nominate_dim1", "")),
            "nominate_dim2": parse_float(row.get("nominate_dim2", "")),
            "num_votes":     parse_int(row.get("nominate_number_of_votes", "")),
            "geo_mean_prob": parse_float(row.get("nominate_geo_mean_probability", "")),
            "synced_at":     now,
        })

    if rows_to_upsert:
        supabase.table("member_scores").upsert(rows_to_upsert, on_conflict="bioguide_id").execute()

    duration = f"{time.time() - start:.1f}s"
    return {
        "source": "voteview",
        "upserted": len(rows_to_upsert),
        "skipped": skipped,
        "duration": duration,
    }


if __name__ == "__main__":
    result = sync_voteview()
    print(json.dumps(result, indent=2))
