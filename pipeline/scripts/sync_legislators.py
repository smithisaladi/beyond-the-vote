"""
Syncs legislators + committees from unitedstates/congress-legislators.

Run: python pipeline/scripts/sync_legislators.py

Options (env vars):
  OPENFEC_API_KEY  — enables FEC committee ID backfill
"""
import os
import sys
import time
import json
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import httpx
from pipeline.lib.supabase_client import create_service_client
from pipeline.lib.config import (
    FEC_BASE, LEGISLATORS_URL, COMMITTEES_URL, COMMITTEE_MEMBERSHIP_URL,
    TIMEOUT_DEFAULT, TIMEOUT_FAST, RATE_LIMIT_FEC,
)

OPENFEC_API_KEY = os.environ.get("OPENFEC_API_KEY", "")


def normalise_party(p: str) -> str:
    lp = (p or "").lower()
    if "democrat" in lp:
        return "Democrat"
    if "republican" in lp:
        return "Republican"
    return "Independent"


def sync_legislators() -> dict:
    start = time.time()
    supabase = create_service_client()

    # ── Legislators ────────────────────────────────────────────────────────────
    print("Fetching legislators...")
    resp = httpx.get(LEGISLATORS_URL, timeout=TIMEOUT_DEFAULT)
    resp.raise_for_status()
    legislators: list[dict] = resp.json()

    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for leg in legislators:
        ids = leg.get("id") or {}
        terms = leg.get("terms") or []
        term = terms[-1] if terms else {}
        bio = leg.get("bio") or {}
        contact = leg.get("contact") or {}
        social = leg.get("social") or {}
        name = leg.get("name") or {}

        bioguide = ids.get("bioguide")
        if not bioguide:
            continue

        fec_ids = ids.get("fec")
        if fec_ids and not isinstance(fec_ids, list):
            fec_ids = [fec_ids]

        # Compute next_election year (same logic as TS)
        next_election = None
        if not term.get("state_rank") and term.get("end"):
            try:
                next_election = datetime.fromisoformat(term["end"]).year
            except ValueError:
                pass

        rows.append({
            "bioguide_id":  bioguide,
            "lis_id":       ids.get("lis"),
            "icpsr_id":     ids.get("icpsr"),
            "fec_ids":      fec_ids,
            "govtrack_id":  str(ids["govtrack"]) if ids.get("govtrack") else None,
            "thomas_id":    ids.get("thomas"),

            "first_name":   name.get("first", ""),
            "last_name":    name.get("last", ""),
            "full_name":    name.get("official_full") or f"{name.get('first', '')} {name.get('last', '')}".strip(),
            "party":        normalise_party(term.get("party", "")),
            "chamber":      "senate" if term.get("type") == "sen" else "house",
            "state":        term.get("state", ""),
            "state_full":   term.get("state_full") or term.get("state", ""),
            "district":     term.get("district"),
            "title":        "Senator" if term.get("type") == "sen" else "Representative",
            "in_office":    True,

            "birthday":     bio.get("birthday"),
            "gender":       bio.get("gender"),
            "website":      contact.get("url"),
            "phone":        contact.get("phone"),
            "address":      contact.get("address"),
            "photo_url":    f"https://theunitedstates.io/images/congress/450x550/{bioguide}.jpg",

            "term_start":   term.get("start"),
            "term_end":     term.get("end"),
            "senate_class": term.get("class"),
            "next_election": next_election,

            "twitter":      social.get("twitter"),
            "facebook":     social.get("facebook"),
            "youtube":      social.get("youtube"),

            "raw_json":     leg,
            "synced_at":    now,
        })

    resp2 = supabase.table("legislators").upsert(rows, on_conflict="bioguide_id").execute()
    print(f"  Upserted {len(rows)} legislators")

    # ── Committees ─────────────────────────────────────────────────────────────
    print("Fetching committees...")
    comm_resp = httpx.get(COMMITTEES_URL, timeout=TIMEOUT_DEFAULT)
    committees_raw: list[dict] = comm_resp.json() if comm_resp.is_success else []

    committee_rows = []
    subcommittee_rows = []

    for c in committees_raw:
        if not c.get("thomas_id"):
            continue
        committee_rows.append({
            "thomas_id": c["thomas_id"],
            "name":      c.get("name"),
            "chamber":   "senate" if c.get("type") == "senate" else "house",
            "url":       c.get("url"),
            "parent_id": None,
        })
        for sub in c.get("subcommittees") or []:
            if not sub.get("thomas_id"):
                continue
            subcommittee_rows.append({
                "thomas_id": f"{c['thomas_id']}{sub['thomas_id']}",
                "name":      sub.get("name"),
                "chamber":   "senate" if c.get("type") == "senate" else "house",
                "url":       None,
                "parent_id": c["thomas_id"],
            })

    if committee_rows:
        supabase.table("committees").upsert(committee_rows, on_conflict="thomas_id").execute()
    if subcommittee_rows:
        supabase.table("committees").upsert(subcommittee_rows, on_conflict="thomas_id").execute()

    all_committees = committee_rows + subcommittee_rows
    print(f"  Upserted {len(all_committees)} committees")

    # ── Committee Memberships ──────────────────────────────────────────────────
    print("Fetching committee memberships...")
    mem_resp = httpx.get(COMMITTEE_MEMBERSHIP_URL, timeout=TIMEOUT_DEFAULT)
    memberships_raw: dict = mem_resp.json() if mem_resp.is_success else {}

    membership_rows = []
    for committee_id, members in memberships_raw.items():
        for m in members:
            if not m.get("bioguide"):
                continue
            membership_rows.append({
                "bioguide_id":  m["bioguide"],
                "committee_id": committee_id,
                "title":        m.get("title"),
            })

    # Filter to existing legislators + committees
    leg_data = supabase.table("legislators").select("bioguide_id").execute()
    comm_data = supabase.table("committees").select("thomas_id").execute()

    leg_set = {r["bioguide_id"] for r in (leg_data.data or [])}
    comm_set = {r["thomas_id"] for r in (comm_data.data or [])}

    valid_memberships = [
        r for r in membership_rows
        if r["bioguide_id"] in leg_set and r["committee_id"] in comm_set
    ]

    if valid_memberships:
        supabase.table("committee_memberships").delete().neq("bioguide_id", "").execute()
        supabase.table("committee_memberships").insert(valid_memberships).execute()
    print(f"  Inserted {len(valid_memberships)} memberships")

    # ── FEC Committee ID backfill ──────────────────────────────────────────────
    if OPENFEC_API_KEY:
        print("Backfilling FEC committee IDs...")
        needs = (
            supabase.table("legislators")
            .select("bioguide_id, fec_ids")
            .not_.is_("fec_ids", "null")
            .is_("fec_committee_id", "null")
            .execute()
        )
        for leg in needs.data or []:
            fec_ids = leg.get("fec_ids") or []
            if not fec_ids:
                continue
            fec_id = fec_ids[0]
            try:
                r = httpx.get(
                    f"{FEC_BASE}/candidate/{fec_id}/committees/",
                    params={"designation": "P", "api_key": OPENFEC_API_KEY},
                    timeout=TIMEOUT_FAST,
                )
                if r.is_success:
                    committee_id = (r.json().get("results") or [{}])[0].get("committee_id")
                    if committee_id:
                        supabase.table("legislators").update(
                            {"fec_committee_id": committee_id}
                        ).eq("bioguide_id", leg["bioguide_id"]).execute()
            except Exception:
                pass
            time.sleep(RATE_LIMIT_FEC)

    duration = f"{time.time() - start:.1f}s"
    return {
        "source": "legislators",
        "upserted": len(rows),
        "committees_upserted": len(all_committees),
        "memberships_upserted": len(valid_memberships),
        "duration": duration,
    }


if __name__ == "__main__":
    result = sync_legislators()
    print(json.dumps(result, indent=2))
