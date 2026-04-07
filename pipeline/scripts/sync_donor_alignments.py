"""
Generates precomputed vote-donor alignment analysis using Claude Haiku.

Three phases (run all by default, or selectively with --phase):
  Phase A (donors)     — sync top PAC donors from OpenFEC → fec_donors
  Phase B (profiles)   — generate LLM interest summaries → donor_interest_profiles
  Phase C (alignments) — analyze vote×donor alignment → vote_donor_alignments

Usage:
  python pipeline/scripts/sync_donor_alignments.py
  python pipeline/scripts/sync_donor_alignments.py --bioguide H001075
  python pipeline/scripts/sync_donor_alignments.py --phase donors
  python pipeline/scripts/sync_donor_alignments.py --phase alignments --days 7
"""
import os
import sys
import time
import json
import argparse
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import httpx
import anthropic
from pipeline.lib.supabase_client import create_service_client
from pipeline.lib.fec_industries import get_employer_industry, INDUSTRY_TO_TOPICS
from pipeline.lib.config import (
    FEC_BASE, RATE_LIMIT_FEC, RATE_LIMIT_LLM, RATE_LIMIT_ERROR,
    TIMEOUT_DEFAULT, PAGE_SIZE_FEC, TOP_DONORS_COUNT, TOP_DONORS_PROMPT,
    LLM_MODEL, LLM_MAX_TOKENS_PROFILE, LLM_MAX_TOKENS_ALIGNMENT,
    LOOKBACK_DAYS_ALIGNMENTS,
)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OPENFEC_API_KEY = os.environ.get("OPENFEC_API_KEY", "")

# ── Run logging ───────────────────────────────────────────────────────────────

def start_run(supabase, phase: str, bioguide_id: str | None) -> str:
    row = supabase.table("pipeline_runs").insert({
        "script": "sync_donor_alignments",
        "phase": phase,
        "bioguide_id": bioguide_id,
        "status": "running",
    }).execute()
    return row.data[0]["id"]


def finish_run(supabase, run_id: str, result: dict) -> None:
    supabase.table("pipeline_runs").update({
        "status": "success",
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "result": result,
    }).eq("id", run_id).execute()


def fail_run(supabase, run_id: str, error: str) -> None:
    supabase.table("pipeline_runs").update({
        "status": "failed",
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "error": str(error)[:2000],
    }).eq("id", run_id).execute()


PAC_SKIP = {
    "ACTBLUE", "WINRED",
    "DEMOCRATIC SENATORIAL CAMPAIGN COMMITTEE", "DSCC",
    "DEMOCRATIC CONGRESSIONAL CAMPAIGN COMMITTEE", "DCCC",
    "NRSC", "NRCC",
    "NATIONAL REPUBLICAN SENATORIAL COMMITTEE",
    "NATIONAL REPUBLICAN CONGRESSIONAL COMMITTEE",
    "DEMOCRATIC NATIONAL COMMITTEE", "DNC",
    "REPUBLICAN NATIONAL COMMITTEE", "RNC",
    "SENATE MAJORITY PAC", "HOUSE MAJORITY PAC",
    "SENATE LEADERSHIP FUND", "CONGRESSIONAL LEADERSHIP FUND",
    "EMILY'S LIST", "END CITIZENS UNITED",
}


# ── Phase A: Sync PAC donors from OpenFEC ─────────────────────────────────────

def sync_donors(bioguide_filter: str | None) -> None:
    if not OPENFEC_API_KEY:
        raise RuntimeError("OPENFEC_API_KEY not set")
    supabase = create_service_client()

    query = (
        supabase.table("legislators")
        .select("bioguide_id, full_name, fec_committee_id, fec_ids")
        .eq("in_office", True)
        .not_.is_("fec_committee_id", "null")
    )
    if bioguide_filter:
        query = query.eq("bioguide_id", bioguide_filter)

    resp = query.execute()
    legislators = resp.data or []

    if not legislators:
        print("No legislators with fec_committee_id found.")
        return

    print(f"Phase A: Syncing donors for {len(legislators)} legislators...")
    total_synced = 0
    now = datetime.now(timezone.utc).isoformat()
    current_year = datetime.now(timezone.utc).year
    cycle = current_year if current_year % 2 == 0 else current_year - 1

    for leg in legislators:
        committee_id = leg.get("fec_committee_id")
        if not committee_id:
            continue

        try:
            r = httpx.get(
                f"{FEC_BASE}/schedules/schedule_a/",
                params={
                    "committee_id": committee_id,
                    "contributor_type": "committee",
                    "sort": "-contribution_receipt_amount",
                    "per_page": PAGE_SIZE_FEC,
                    "api_key": OPENFEC_API_KEY,
                },
                timeout=TIMEOUT_DEFAULT,
            )
            if not r.is_success:
                print(f"  FEC API error for {leg['bioguide_id']}: {r.status_code}")
                time.sleep(RATE_LIMIT_ERROR)
                continue

            totals: dict[str, dict] = {}
            for t in r.json().get("results") or []:
                raw: str = t.get("contributor_name") or ""
                if not raw:
                    continue
                key = raw.upper().strip()
                if key in PAC_SKIP:
                    continue
                amount: float = t.get("contribution_receipt_amount") or 0
                if amount <= 0:
                    continue
                if key not in totals:
                    totals[key] = {"display": raw, "total": 0, "committee_id": t.get("contributor_committee_id")}
                totals[key]["total"] += amount

            top10 = sorted(totals.items(), key=lambda x: -x[1]["total"])[:TOP_DONORS_COUNT]
            if not top10:
                time.sleep(RATE_LIMIT_FEC)
                continue

            rows = [
                {
                    "bioguide_id":    leg["bioguide_id"],
                    "committee_name": v["display"],
                    "committee_id":   v["committee_id"],
                    "total_amount":   round(v["total"]),
                    "cycle":          cycle,
                    "synced_at":      now,
                }
                for _, v in top10
            ]

            supabase.table("fec_donors").upsert(rows, on_conflict="bioguide_id,committee_name").execute()
            print(f"  {leg['bioguide_id']} ({leg.get('full_name', '')}): {len(rows)} donors")
            total_synced += len(rows)

        except Exception as err:
            print(f"  Error for {leg['bioguide_id']}: {err}")

        time.sleep(RATE_LIMIT_FEC)

    print(f"Phase A complete: {total_synced} donor records upserted.\n")
    return {"legislators": len(legislators), "upserted": total_synced}


# ── Phase B: Generate interest profiles for PACs ──────────────────────────────

def generate_interest_profiles() -> None:
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    supabase = create_service_client()
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    donors_resp = supabase.table("fec_donors").select("committee_name").execute()
    all_names = list({d["committee_name"] for d in (donors_resp.data or [])})

    if not all_names:
        print("Phase B: No donors found. Run phase A first.")
        return

    existing_resp = supabase.table("donor_interest_profiles").select("committee_name").execute()
    existing_set = {e["committee_name"] for e in (existing_resp.data or [])}
    to_process = [n for n in all_names if n not in existing_set]

    print(f"Phase B: Generating interest profiles for {len(to_process)} PACs ({len(existing_set)} already done)...")
    generated = 0
    now = datetime.now(timezone.utc).isoformat()

    for name in to_process:
        industry = get_employer_industry(name.upper())
        try:
            message = client.messages.create(
                model=LLM_MODEL,
                max_tokens=LLM_MAX_TOKENS_PROFILE,
                messages=[{
                    "role": "user",
                    "content": (
                        f"Given this political action committee name and industry category, "
                        f"write exactly one sentence describing what policy outcomes this organization "
                        f"likely supports or opposes. Be specific to their industry interests.\n\n"
                        f"PAC Name: {name}\n"
                        f"Industry: {industry}\n\n"
                        f"Respond with ONLY the one-sentence description. No preamble, no quotes."
                    ),
                }],
            )
            summary = (message.content[0].text or "").strip()  # type: ignore[union-attr]
            if not summary:
                print(f'  Empty response for "{name}"')
                time.sleep(RATE_LIMIT_LLM)
                continue

            supabase.table("donor_interest_profiles").upsert({
                "committee_name":  name,
                "interest_summary": summary,
                "fec_industry":    industry,
                "generated_at":    now,
            }, on_conflict="committee_name").execute()

            print(f'  "{name}": {summary[:80]}...')
            generated += 1
        except Exception as err:
            print(f'  LLM error for "{name}": {err}')

        time.sleep(RATE_LIMIT_LLM)

    print(f"Phase B complete: {generated} profiles generated.\n")
    return {"skipped": len(existing_set), "processed": len(to_process), "generated": generated}


# ── Phase C: Generate vote-donor alignment analysis ───────────────────────────

def generate_alignments(bioguide_filter: str | None, days_back: int) -> None:
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    supabase = create_service_client()
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).date().isoformat()

    votes_query = (
        supabase.table("bill_vote_positions")
        .select("bioguide_id, position, bill_vote_summaries!inner(id, bill_id, date, title, question)")
        .in_("position", ["Yea", "Nay"])
        .gte("bill_vote_summaries.date", cutoff_date)
    )
    if bioguide_filter:
        votes_query = votes_query.eq("bioguide_id", bioguide_filter)

    vote_positions = votes_query.execute().data or []

    if not vote_positions:
        print(f"Phase C: No votes found in the last {days_back} days.")
        return

    # Find already-processed pairs
    existing_resp = (
        supabase.table("vote_donor_alignments").select("vote_id, bioguide_id").execute()
    )
    processed_set = {
        f"{a['vote_id']}:{a['bioguide_id']}" for a in (existing_resp.data or [])
    }

    # Fetch bill data
    bill_ids = list({
        vp["bill_vote_summaries"]["bill_id"]
        for vp in vote_positions
        if vp.get("bill_vote_summaries", {}).get("bill_id")
    })
    bills_resp = (
        supabase.table("bills")
        .select("bill_id, title, summary, topics, referenced_agencies")
        .in_("bill_id", bill_ids)
        .not_.is_("summary", "null")
        .execute()
    )
    bill_map = {b["bill_id"]: b for b in (bills_resp.data or [])}

    # Fetch donors and profiles
    donors_resp = (
        supabase.table("fec_donors").select("bioguide_id, committee_name, total_amount").execute()
    )
    profiles_resp = (
        supabase.table("donor_interest_profiles")
        .select("committee_name, interest_summary, fec_industry")
        .execute()
    )
    profile_map = {p["committee_name"]: p for p in (profiles_resp.data or [])}

    # Group donors by legislator
    donors_by_legislator: dict[str, list[dict]] = {}
    for d in (donors_resp.data or []):
        profile = profile_map.get(d["committee_name"])
        if not profile:
            continue
        if d["bioguide_id"] not in donors_by_legislator:
            donors_by_legislator[d["bioguide_id"]] = []
        donors_by_legislator[d["bioguide_id"]].append({
            "name": d["committee_name"],
            "amount": d["total_amount"],
            "profile": profile,
        })

    # Fetch legislator info
    leg_resp = (
        supabase.table("legislators")
        .select("bioguide_id, full_name, party, state")
        .execute()
    )
    leg_map = {l["bioguide_id"]: l for l in (leg_resp.data or [])}

    print(f"Phase C: Analyzing {len(vote_positions)} vote positions ({days_back}-day window)...")
    analyzed = skipped = alignments_stored = 0
    now = datetime.now(timezone.utc).isoformat()

    for vp in vote_positions:
        summary = vp.get("bill_vote_summaries") or {}
        if not summary:
            continue

        pair_key = f"{summary['id']}:{vp['bioguide_id']}"
        if pair_key in processed_set:
            skipped += 1
            continue

        bill = bill_map.get(summary.get("bill_id", ""))
        if not bill or not bill.get("summary"):
            skipped += 1
            continue

        leg_donors = donors_by_legislator.get(vp["bioguide_id"]) or []
        if not leg_donors:
            skipped += 1
            continue

        bill_topics: list[str] = bill.get("topics") or []

        # Pre-filter: only donors whose industry has topic overlap with this bill
        relevant_donors = [
            d for d in leg_donors
            if any(
                t in bill_topics
                for t in (INDUSTRY_TO_TOPICS.get(d["profile"].get("fec_industry", ""), []))
            )
        ]
        if not relevant_donors:
            skipped += 1
            continue

        leg = leg_map.get(vp["bioguide_id"]) or {}
        donor_lines = "\n".join(
            f"- {d['name']} (${d['amount']:,}): {d['profile']['interest_summary']}"
            for d in relevant_donors[:TOP_DONORS_PROMPT]
        )

        prompt = f"""You are analyzing whether a legislator's vote on a bill aligns with their campaign donors' interests on a public transparency platform.

BILL: {bill['title']}
SUMMARY: {bill['summary'][:600]}
TOPICS: {', '.join(bill_topics)}
AGENCIES REFERENCED: {', '.join(bill.get('referenced_agencies') or []) or 'none'}

LEGISLATOR: {leg.get('full_name', vp['bioguide_id'])} ({leg.get('party', '?')}-{leg.get('state', '?')})
VOTE: {vp['position']}

TOP DONORS WITH POSSIBLE INTEREST IN THIS BILL:
{donor_lines}

For each donor listed, assess whether their interests are genuinely relevant to this specific bill.
Be CONSERVATIVE — only flag connections that are obvious and specific. A vague industry overlap is NOT enough.
False positives on a transparency platform cause real harm. When in doubt, mark relevant: false.

Respond ONLY with valid JSON (no markdown, no explanation):
{{
  "alignments": [
    {{
      "donor": "exact PAC name from the list",
      "relevant": true,
      "donor_likely_position": "support",
      "vote_aligns": true,
      "explanation": "One specific sentence explaining the direct connection between this bill and this donor's interests."
    }}
  ]
}}"""

        try:
            message = client.messages.create(
                model=LLM_MODEL,
                max_tokens=LLM_MAX_TOKENS_ALIGNMENT,
                messages=[{"role": "user", "content": prompt}],
            )
            raw_text = (message.content[0].text or "").strip()  # type: ignore[union-attr]

            parsed = None
            try:
                parsed = json.loads(raw_text)
            except json.JSONDecodeError:
                import re
                m = re.search(r"\{[\s\S]*\}", raw_text)
                if m:
                    try:
                        parsed = json.loads(m.group(0))
                    except json.JSONDecodeError:
                        pass

            if not parsed or not parsed.get("alignments"):
                print(f"  Could not parse JSON for {pair_key}")
                analyzed += 1
                time.sleep(RATE_LIMIT_LLM)
                continue

            to_store = [a for a in parsed["alignments"] if a.get("relevant") is True]
            if to_store:
                rows = []
                for a in to_store:
                    donor_record = next((d for d in relevant_donors if d["name"] == a["donor"]), None)
                    rows.append({
                        "vote_id":               summary["id"],
                        "bioguide_id":           vp["bioguide_id"],
                        "donor_name":            a["donor"],
                        "donor_amount":          donor_record["amount"] if donor_record else None,
                        "donor_likely_position": a.get("donor_likely_position"),
                        "vote_aligns":           a.get("vote_aligns"),
                        "explanation":           a.get("explanation"),
                        "generated_at":          now,
                    })

                supabase.table("vote_donor_alignments").upsert(
                    rows, on_conflict="vote_id,bioguide_id,donor_name"
                ).execute()
                print(f"  {pair_key}: {len(rows)} alignment(s) stored")
                alignments_stored += len(rows)
            else:
                print(f"  {pair_key}: no relevant alignments found")

            analyzed += 1
        except Exception as err:
            print(f"  LLM error for {pair_key}: {err}")
            analyzed += 1

        time.sleep(RATE_LIMIT_LLM)

    print(f"Phase C complete: {analyzed} analyzed, {skipped} skipped, {alignments_stored} alignments stored.\n")
    return {"analyzed": analyzed, "skipped": skipped, "stored": alignments_stored}


# ── Main ─────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync vote-donor alignments")
    parser.add_argument("--phase", default="all", choices=["donors", "profiles", "alignments", "all"])
    parser.add_argument("--bioguide", default=None, help="Filter to a single legislator")
    parser.add_argument("--days", type=int, default=LOOKBACK_DAYS_ALIGNMENTS, help="Lookback window in days")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    print(f"sync_donor_alignments: phase={args.phase}, bioguide={args.bioguide or 'all'}, days={args.days}\n")

    _supabase = create_service_client()

    if args.phase in ("all", "donors"):
        _run_id = start_run(_supabase, "donors", args.bioguide)
        try:
            _result = sync_donors(args.bioguide)
            finish_run(_supabase, _run_id, _result)
        except Exception as _e:
            fail_run(_supabase, _run_id, str(_e))
            raise

    if args.phase in ("all", "profiles"):
        _run_id = start_run(_supabase, "profiles", args.bioguide)
        try:
            _result = generate_interest_profiles()
            finish_run(_supabase, _run_id, _result)
        except Exception as _e:
            fail_run(_supabase, _run_id, str(_e))
            raise

    if args.phase in ("all", "alignments"):
        _run_id = start_run(_supabase, "alignments", args.bioguide)
        try:
            _result = generate_alignments(args.bioguide, args.days)
            finish_run(_supabase, _run_id, _result)
        except Exception as _e:
            fail_run(_supabase, _run_id, str(_e))
            raise

    print("Done.")
