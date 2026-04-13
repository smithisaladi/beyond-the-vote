"""
sync_fec.py — Sync FEC campaign finance data via the OpenFEC REST API.

Queries api.open.fec.gov for PAC contributions, independent expenditures,
individual contributions (Schedule A), and candidate financial totals,
then derives legislator_funding_summary, legislator_top_pacs, and
legislator_top_contributors.

No local file I/O — designed to run as a cron job on ephemeral CI runners.

Usage:
    python -m scripts.sync.sync_fec
    python -m scripts.sync.sync_fec --cycles 2026
"""

import argparse
import logging
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2]))

from config import FEC_CYCLES, PAC_DIRECT_TPS, UPSERT_BATCH, is_active_cycle
from load import log_run_end, log_run_start, upsert
from utils import batch, get_supabase

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

SCRIPT = "sync_fec"
FEC_API_BASE = "https://api.open.fec.gov/v1"
PAGE_SIZE = 100
TOP_CONTRIBUTORS_LIMIT = 20

# Non-employer values to exclude when grouping by employer (matches compute_funding_summaries)
NON_EMPLOYERS = {
    'SELF-EMPLOYED', 'SELF EMPLOYED', 'SELF', 'NONE', 'N/A', 'NA',
    'NOT EMPLOYED', 'RETIRED', 'INFORMATION REQUESTED',
    'INFORMATION REQUESTED PER BEST EFFORTS', 'REFUSED',
    'NOT APPLICABLE', 'HOMEMAKER', 'STUDENT', 'UNEMPLOYED',
    'NOT AVAILABLE', 'REQUESTED', 'BEST EFFORTS', 'DISABLED',
}


def get_fec_api_key() -> str:
    key = os.environ.get("FEC_API_KEY") or os.environ.get("OPENFEC_API_KEY", "")
    if not key:
        log.warning("FEC_API_KEY not set — FEC API requests will fail")
    return key


# ── FEC API pagination helper ────────────────────────────────────────────────


def fec_paginate(endpoint: str, params: dict, api_key: str) -> list[dict]:
    """Paginate through an OpenFEC API endpoint, returning all results."""
    import requests

    all_results: list[dict] = []
    page = 1
    params = {**params, "api_key": api_key, "per_page": PAGE_SIZE}

    while True:
        params["page"] = page
        url = f"{FEC_API_BASE}{endpoint}"
        try:
            resp = requests.get(url, params=params, timeout=30)
            if resp.status_code == 429:
                import time
                retry_after = int(resp.headers.get("Retry-After", 60))
                log.warning("FEC API 429 — sleeping %ds", retry_after)
                time.sleep(retry_after)
                continue
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            log.warning("FEC API error for %s page %d: %s", endpoint, page, e)
            break

        results = data.get("results", [])
        if not results:
            break

        all_results.extend(results)

        pagination = data.get("pagination", {})
        total_pages = pagination.get("pages", 1)
        if page >= total_pages:
            break
        page += 1

    return all_results


# ── Load tracked legislators ─────────────────────────────────────────────────


def load_legislators() -> dict[str, dict]:
    """Return {bioguide_id: {state, fec_ids[]}} for all legislators with FEC IDs."""
    db = get_supabase()
    result: dict[str, dict] = {}
    offset = 0
    while True:
        res = (
            db.table("legislators")
            .select("bioguide_id,state,fec_ids")
            .not_.is_("fec_ids", "null")
            .range(offset, offset + 999)
            .execute()
        )
        for row in res.data:
            fec_ids = row.get("fec_ids") or []
            if fec_ids:
                result[row["bioguide_id"]] = row
        if len(res.data) < 1000:
            break
        offset += 1000
    log.info("Loaded %d legislators with FEC IDs", len(result))
    return result


# ── Resolve candidate → committee IDs ──────────────────────────────────────


def resolve_principal_committees(
    legislators: dict[str, dict], api_key: str
) -> dict[str, list[str]]:
    """Return {bioguide_id: [committee_ids]} for principal campaign committees."""
    all_fec_ids: dict[str, str] = {}  # fec_id → bioguide_id
    for bioguide_id, leg in legislators.items():
        for fec_id in leg.get("fec_ids", []):
            all_fec_ids[fec_id] = bioguide_id

    result: dict[str, list[str]] = {}
    fec_id_list = list(all_fec_ids.keys())

    for chunk in batch(fec_id_list, 20):
        results = fec_paginate(
            "/candidates/",
            {"candidate_id": chunk, "sort": "-election_year"},
            api_key,
        )
        for r in results:
            cand_id = r.get("candidate_id", "")
            bioguide_id = all_fec_ids.get(cand_id)
            if not bioguide_id:
                continue
            pcc = r.get("principal_committees") or []
            cmte_ids = [c["committee_id"] for c in pcc if c.get("committee_id")]
            if cmte_ids:
                existing = result.get(bioguide_id, [])
                result[bioguide_id] = list(set(existing + cmte_ids))

    log.info("Resolved principal committees for %d legislators", len(result))
    return result


# ── Sync individual contributions (Schedule A) ────────────────────────────


def _normalize_employer(employer: str) -> str:
    """Normalize employer name: upper-case, collapse whitespace."""
    return re.sub(r"\s+", " ", employer.strip().upper())


def _to_title_case(s: str) -> str:
    """Convert ALL-CAPS org name to Title Case, preserving short words."""
    if not s:
        return s
    words = s.lower().split()
    small = {"of", "the", "and", "for", "in", "on", "at", "to", "a", "an"}
    return " ".join(w if (i > 0 and w in small) else w.capitalize() for i, w in enumerate(words))


def sync_individual_contributions(
    legislators: dict[str, dict],
    cmte_map: dict[str, list[str]],
    cycle: int,
    api_key: str,
) -> tuple[dict[str, dict], dict[str, dict[str, float]]]:
    """Fetch Schedule A (itemized individual contributions) and aggregate in-memory.

    Returns:
        geo_by_leg:   {bioguide_id: {in_state_total, out_of_state_total, dc_donor_total}}
        emp_by_leg:   {bioguide_id: {employer_upper: total_amount}}
    """
    geo_by_leg: dict[str, dict] = {}
    emp_by_leg: dict[str, dict[str, float]] = {}
    total_fetched = 0

    for bioguide_id, leg in legislators.items():
        cmte_ids = cmte_map.get(bioguide_id, [])
        if not cmte_ids:
            continue

        state = (leg.get("state") or "").upper()
        in_state = 0.0
        out_of_state = 0.0
        dc_total = 0.0
        employer_totals: dict[str, float] = {}

        for cmte_id in cmte_ids:
            results = fec_paginate(
                "/schedules/schedule_a/",
                {
                    "committee_id": cmte_id,
                    "two_year_transaction_period": cycle,
                    "min_amount": 200,
                    "sort": "-contribution_receipt_date",
                    "is_individual": "true",
                },
                api_key,
            )

            for r in results:
                amt = r.get("contribution_receipt_amount", 0) or 0
                contributor_state = (r.get("contributor_state") or "").upper()
                employer = (r.get("contributor_employer") or "").strip()

                # Geographic aggregation
                if contributor_state == "DC":
                    dc_total += amt
                    out_of_state += amt
                elif contributor_state and contributor_state == state:
                    in_state += amt
                elif contributor_state:
                    out_of_state += amt

                # Employer aggregation
                if employer:
                    norm = _normalize_employer(employer)
                    if norm and norm not in NON_EMPLOYERS:
                        employer_totals[norm] = employer_totals.get(norm, 0) + amt

            total_fetched += len(results)

        geo_by_leg[bioguide_id] = {
            "in_state_total": round(in_state, 2),
            "out_of_state_total": round(out_of_state, 2),
            "dc_donor_total": round(dc_total, 2),
        }
        emp_by_leg[bioguide_id] = employer_totals

    log.info("Individual contributions cycle=%d: %d records aggregated for %d legislators",
             cycle, total_fetched, len(geo_by_leg))
    return geo_by_leg, emp_by_leg


# ── Build top contributors rows from in-memory employer + PAC data ─────────


def build_top_contributors(
    emp_by_leg: dict[str, dict[str, float]],
    legislators: dict[str, dict],
    cycle: int,
) -> list[dict]:
    """Build legislator_top_contributors rows from Schedule A employer aggregations
    combined with PAC contributions from Supabase (grouped by connected org)."""
    db = get_supabase()
    all_rows: list[dict] = []

    for bioguide_id, employer_totals in emp_by_leg.items():
        leg = legislators.get(bioguide_id, {})
        fec_ids = leg.get("fec_ids", [])

        # Load PAC contributions grouped by connected org from Supabase
        pac_by_org: dict[str, dict] = {}  # org_upper → {total, cmte_id}
        for fec_id in fec_ids:
            offset = 0
            while True:
                res = (
                    db.table("pac_to_candidate")
                    .select("cmte_id,transaction_amt")
                    .eq("cand_id", fec_id)
                    .eq("cycle", cycle)
                    .range(offset, offset + 999)
                    .execute()
                )
                if not res.data:
                    break
                for row in res.data:
                    cmte_id = row.get("cmte_id", "")
                    amt = float(row.get("transaction_amt", 0) or 0)
                    # We don't have connected_org in pac_to_candidate — use cmte_id as key
                    # The top_pacs table may have enriched names, but for now group by cmte_id
                    if cmte_id:
                        existing = pac_by_org.get(cmte_id, {"total": 0, "cmte_id": cmte_id})
                        existing["total"] += amt
                        pac_by_org[cmte_id] = existing
                if len(res.data) < 1000:
                    break
                offset += 1000

        # Try to get org names for PAC cmte_ids from legislator_top_pacs
        pac_org_by_cmte: dict[str, str] = {}
        if pac_by_org:
            for fec_id in fec_ids:
                res = (
                    db.table("legislator_top_pacs")
                    .select("cmte_id,cmte_name,connected_org")
                    .eq("bioguide_id", bioguide_id)
                    .eq("cycle", cycle)
                    .execute()
                )
                for row in res.data:
                    org = (row.get("connected_org") or row.get("cmte_name") or "").strip()
                    if org:
                        pac_org_by_cmte[row["cmte_id"]] = _normalize_employer(org)
                break  # only need one query per legislator

        # Merge PAC data by org name
        pac_by_org_name: dict[str, dict] = {}  # org_upper → {pac_total, cmte_id}
        for cmte_id, info in pac_by_org.items():
            org = pac_org_by_cmte.get(cmte_id, cmte_id)
            if org in pac_by_org_name:
                pac_by_org_name[org]["pac_total"] += info["total"]
            else:
                pac_by_org_name[org] = {"pac_total": info["total"], "cmte_id": cmte_id}

        # Combine individual (employer) + PAC (connected org)
        all_orgs = set(employer_totals.keys()) | set(pac_by_org_name.keys())
        combined: list[dict] = []
        for org in all_orgs:
            if not org or org in NON_EMPLOYERS:
                continue
            indiv = employer_totals.get(org, 0)
            pac_info = pac_by_org_name.get(org, {"pac_total": 0, "cmte_id": None})
            grand = indiv + pac_info["pac_total"]
            if grand <= 0:
                continue
            combined.append({
                "bioguide_id": bioguide_id,
                "cycle": cycle,
                "org_name": _to_title_case(org),
                "individual_total": round(indiv, 2),
                "pac_total": round(pac_info["pac_total"], 2),
                "grand_total": round(grand, 2),
                "cmte_id": pac_info.get("cmte_id"),
                "rank": 0,
            })

        combined.sort(key=lambda x: x["grand_total"], reverse=True)
        for i, row in enumerate(combined[:TOP_CONTRIBUTORS_LIMIT]):
            row["rank"] = i + 1
            all_rows.append(row)

    log.info("Computed %d top contributor rows for cycle %d", len(all_rows), cycle)
    return all_rows


# ── Sync PAC contributions (Schedule B, 24K/24Z) ────────────────────────────


def sync_pac_contributions(legislators: dict[str, dict], cycle: int, api_key: str) -> int:
    """Fetch PAC-to-candidate contributions via FEC API and upsert to Supabase."""
    total = 0

    for bioguide_id, leg in legislators.items():
        for fec_id in leg.get("fec_ids", []):
            results = fec_paginate(
                "/schedules/schedule_b/",
                {
                    "recipient_id": fec_id,
                    "two_year_transaction_period": cycle,
                    "sort": "-disbursement_date",
                },
                api_key,
            )

            rows: list[dict] = []
            for r in results:
                tp = (r.get("line_number_label") or r.get("memo_code") or "")
                # Use disbursement_type or infer from schedule B
                disb_tp = r.get("disbursement_type") or ""
                # Filter to direct PAC contributions (24K, 24Z)
                if disb_tp and disb_tp not in PAC_DIRECT_TPS:
                    continue
                rows.append({
                    "sub_id": str(r.get("sub_id", "")),
                    "cmte_id": r.get("committee_id", ""),
                    "cand_id": fec_id,
                    "transaction_tp": disb_tp or "24K",
                    "transaction_amt": r.get("disbursement_amount", 0),
                    "transaction_dt": r.get("disbursement_date", ""),
                    "cycle": cycle,
                })

            if rows:
                for chunk in batch(rows, UPSERT_BATCH):
                    upsert("pac_to_candidate", chunk)
                total += len(rows)

    log.info("PAC contributions cycle=%d: %d rows upserted", cycle, total)
    return total


# ── Sync independent expenditures (Schedule E) ──────────────────────────────


def sync_independent_expenditures(legislators: dict[str, dict], cycle: int, api_key: str) -> int:
    """Fetch independent expenditures via FEC API and upsert to Supabase."""
    total = 0

    for bioguide_id, leg in legislators.items():
        for fec_id in leg.get("fec_ids", []):
            results = fec_paginate(
                "/schedules/schedule_e/",
                {
                    "candidate_id": fec_id,
                    "cycle": cycle,
                    "sort": "-expenditure_date",
                },
                api_key,
            )

            rows: list[dict] = []
            for r in results:
                sup_opp = r.get("support_oppose_indicator", "")
                rows.append({
                    "sub_id": str(r.get("sub_id", "")),
                    "cmte_id": r.get("committee_id", ""),
                    "cand_id": fec_id,
                    "sup_opp": sup_opp,
                    "transaction_tp": "24E" if sup_opp == "S" else "24A",
                    "transaction_amt": r.get("expenditure_amount", 0),
                    "transaction_dt": r.get("expenditure_date", ""),
                    "cycle": cycle,
                })

            if rows:
                for chunk in batch(rows, UPSERT_BATCH):
                    upsert("independent_expenditures", chunk)
                total += len(rows)

    log.info("Independent expenditures cycle=%d: %d rows upserted", cycle, total)
    return total


# ── Fetch candidate financial totals ─────────────────────────────────────────


def fetch_candidate_totals(legislators: dict[str, dict], cycle: int, api_key: str) -> dict[str, dict]:
    """Fetch candidate financial totals from FEC API. Returns {bioguide_id: totals_dict}."""
    totals: dict[str, dict] = {}

    # Batch by fec_id (API supports comma-separated candidate_id)
    all_fec_ids: dict[str, str] = {}  # fec_id → bioguide_id
    for bioguide_id, leg in legislators.items():
        for fec_id in leg.get("fec_ids", []):
            all_fec_ids[fec_id] = bioguide_id

    # Query in batches of 20 candidate IDs
    fec_id_list = list(all_fec_ids.keys())
    for chunk in batch(fec_id_list, 20):
        results = fec_paginate(
            "/candidates/totals/",
            {
                "candidate_id": chunk,
                "cycle": cycle,
            },
            api_key,
        )

        for r in results:
            cand_id = r.get("candidate_id", "")
            bioguide_id = all_fec_ids.get(cand_id)
            if not bioguide_id:
                continue

            # If we already have totals for this legislator, pick the one with higher receipts
            existing = totals.get(bioguide_id, {})
            new_receipts = r.get("receipts", 0) or 0
            if existing.get("total_receipts", 0) >= new_receipts:
                continue

            totals[bioguide_id] = {
                "total_receipts": new_receipts,
                "pac_direct_total": r.get("other_political_committee_contributions", 0) or 0,
                "large_donor_total": r.get("individual_itemized_contributions", 0) or 0,
                "small_donor_total": r.get("individual_unitemized_contributions", 0) or 0,
                "pol_pty_total": r.get("political_party_committee_contributions", 0) or 0,
                "self_funded_total": r.get("candidate_contribution", 0) or 0,
            }

    log.info("Candidate totals cycle=%d: %d legislators", cycle, len(totals))
    return totals


# ── Compute top PACs from Supabase data ──────────────────────────────────────


def compute_top_pacs_from_supabase(legislators: dict[str, dict], cycle: int) -> list[dict]:
    """Compute top 20 PACs per legislator from Supabase pac_to_candidate + IE tables."""
    db = get_supabase()
    top_pacs_rows: list[dict] = []

    for bioguide_id, leg in legislators.items():
        fec_ids = leg.get("fec_ids", [])
        if not fec_ids:
            continue

        # Aggregate PAC direct contributions
        pac_by_cmte: dict[str, float] = {}
        for fec_id in fec_ids:
            offset = 0
            while True:
                res = (
                    db.table("pac_to_candidate")
                    .select("cmte_id,transaction_amt")
                    .eq("cand_id", fec_id)
                    .eq("cycle", cycle)
                    .range(offset, offset + 999)
                    .execute()
                )
                for row in res.data:
                    cmte = row.get("cmte_id", "")
                    amt = float(row.get("transaction_amt", 0) or 0)
                    pac_by_cmte[cmte] = pac_by_cmte.get(cmte, 0) + amt
                if len(res.data) < 1000:
                    break
                offset += 1000

        # Aggregate IE for/against
        ie_for_by_cmte: dict[str, float] = {}
        ie_against_by_cmte: dict[str, float] = {}
        for fec_id in fec_ids:
            offset = 0
            while True:
                res = (
                    db.table("independent_expenditures")
                    .select("cmte_id,transaction_amt,sup_opp")
                    .eq("cand_id", fec_id)
                    .eq("cycle", cycle)
                    .range(offset, offset + 999)
                    .execute()
                )
                for row in res.data:
                    cmte = row.get("cmte_id", "")
                    amt = float(row.get("transaction_amt", 0) or 0)
                    if row.get("sup_opp") == "S":
                        ie_for_by_cmte[cmte] = ie_for_by_cmte.get(cmte, 0) + amt
                    else:
                        ie_against_by_cmte[cmte] = ie_against_by_cmte.get(cmte, 0) + amt
                if len(res.data) < 1000:
                    break
                offset += 1000

        # Combine and rank
        all_cmtes = set(pac_by_cmte) | set(ie_for_by_cmte) | set(ie_against_by_cmte)
        combined: list[dict] = []
        for cmte_id in all_cmtes:
            direct = pac_by_cmte.get(cmte_id, 0)
            ie_for = ie_for_by_cmte.get(cmte_id, 0)
            ie_against = ie_against_by_cmte.get(cmte_id, 0)
            total_support = direct + ie_for
            combined.append({
                "bioguide_id": bioguide_id,
                "cycle": cycle,
                "cmte_id": cmte_id,
                "cmte_name": "",
                "connected_org": "",
                "industry": "",
                "direct_contribution": round(direct, 2),
                "ie_for": round(ie_for, 2),
                "ie_against": round(ie_against, 2),
                "total_support": round(total_support, 2),
                "rank": 0,
            })

        # Sort by total_support descending, take top 20
        combined.sort(key=lambda x: x["total_support"], reverse=True)
        for i, row in enumerate(combined[:20]):
            row["rank"] = i + 1
            top_pacs_rows.append(row)

    log.info("Computed %d top PAC rows for cycle %d", len(top_pacs_rows), cycle)
    return top_pacs_rows


# ── Build funding summary rows ───────────────────────────────────────────────


def build_funding_summary_rows(
    legislators: dict[str, dict],
    candidate_totals: dict[str, dict],
    cycle: int,
) -> list[dict]:
    """Build legislator_funding_summary rows from FEC API candidate totals."""
    rows: list[dict] = []

    for bioguide_id in candidate_totals:
        t = candidate_totals[bioguide_id]
        total_receipts = t.get("total_receipts", 0)
        pac_direct = t.get("pac_direct_total", 0)
        large_donor = t.get("large_donor_total", 0)
        small_donor = t.get("small_donor_total", 0)
        pol_pty = t.get("pol_pty_total", 0)
        self_funded = t.get("self_funded_total", 0)

        known = pac_direct + large_donor + small_donor + pol_pty + self_funded
        other_total = max(0, total_receipts - known) if total_receipts else 0

        rows.append({
            "bioguide_id": bioguide_id,
            "cycle": cycle,
            "total_receipts": round(total_receipts, 2),
            "pac_direct_total": round(pac_direct, 2),
            "pac_direct_pct": round(pac_direct / total_receipts * 100, 1) if total_receipts else 0,
            "superpac_ie_for": None,       # updated from IE data below
            "superpac_ie_against": None,   # updated from IE data below
            "large_donor_total": round(large_donor, 2),
            "large_donor_pct": round(large_donor / total_receipts * 100, 1) if total_receipts else 0,
            "small_donor_total": round(small_donor, 2),
            "small_donor_pct": round(small_donor / total_receipts * 100, 1) if total_receipts else 0,
            "pol_pty_total": round(pol_pty, 2),
            "pol_pty_pct": round(pol_pty / total_receipts * 100, 1) if total_receipts else 0,
            "self_funded_total": round(self_funded, 2),
            "self_funded_pct": round(self_funded / total_receipts * 100, 1) if total_receipts else 0,
            "other_total": round(other_total, 2),
            "other_pct": round(other_total / total_receipts * 100, 1) if total_receipts else 0,
            # Geographic fields preserved from bulk run — not available via API
            "in_state_total": None,
            "out_of_state_total": None,
            "out_of_state_pct": None,
            "dc_donor_total": None,
            "top_industries": None,
        })

    return rows


def enrich_with_ie_totals(rows: list[dict], legislators: dict[str, dict], cycle: int) -> None:
    """Fill in superpac_ie_for/against from Supabase independent_expenditures."""
    db = get_supabase()

    for row in rows:
        bioguide_id = row["bioguide_id"]
        leg = legislators.get(bioguide_id, {})
        fec_ids = leg.get("fec_ids", [])
        ie_for = 0.0
        ie_against = 0.0

        for fec_id in fec_ids:
            offset = 0
            while True:
                res = (
                    db.table("independent_expenditures")
                    .select("transaction_amt,sup_opp")
                    .eq("cand_id", fec_id)
                    .eq("cycle", cycle)
                    .range(offset, offset + 999)
                    .execute()
                )
                for r in res.data:
                    amt = float(r.get("transaction_amt", 0) or 0)
                    if r.get("sup_opp") == "S":
                        ie_for += amt
                    else:
                        ie_against += amt
                if len(res.data) < 1000:
                    break
                offset += 1000

        row["superpac_ie_for"] = round(ie_for, 2)
        row["superpac_ie_against"] = round(ie_against, 2)


def enrich_with_geo(rows: list[dict], geo_by_leg: dict[str, dict]) -> None:
    """Fill in geographic fields on funding summary rows from Schedule A aggregations."""
    for row in rows:
        geo = geo_by_leg.get(row["bioguide_id"])
        if not geo:
            continue
        row["in_state_total"] = geo["in_state_total"]
        row["out_of_state_total"] = geo["out_of_state_total"]
        row["dc_donor_total"] = geo["dc_donor_total"]
        total_individual = geo["in_state_total"] + geo["out_of_state_total"]
        row["out_of_state_pct"] = (
            round(geo["out_of_state_total"] / total_individual * 100, 1)
            if total_individual > 0 else 0
        )


# ── Main ─────────────────────────────────────────────────────────────────────


def run(cycles: list[int] | None = None) -> None:
    if cycles is None:
        cycles = [c for c in FEC_CYCLES if is_active_cycle(c)]
    if not cycles:
        cycles = FEC_CYCLES

    run_id = log_run_start(SCRIPT)
    api_key = get_fec_api_key()
    results: dict = {}

    try:
        legislators = load_legislators()

        # Resolve candidate → principal campaign committee IDs (needed for Schedule A)
        cmte_map = resolve_principal_committees(legislators, api_key)

        for cycle in cycles:
            log.info("=== Syncing FEC data for cycle %d ===", cycle)

            # Step 1: Sync PAC contributions
            pac_n = sync_pac_contributions(legislators, cycle, api_key)
            results[f"pac_to_candidate_{cycle}"] = pac_n

            # Step 2: Sync independent expenditures
            ie_n = sync_independent_expenditures(legislators, cycle, api_key)
            results[f"independent_expenditures_{cycle}"] = ie_n

            # Step 3: Sync individual contributions (Schedule A) — aggregated in-memory
            geo_by_leg, emp_by_leg = sync_individual_contributions(
                legislators, cmte_map, cycle, api_key,
            )
            results[f"individual_contributions_{cycle}"] = sum(
                len(v) for v in emp_by_leg.values()
            )

            # Step 4: Fetch candidate financial totals
            cand_totals = fetch_candidate_totals(legislators, cycle, api_key)

            # Step 5: Build and enrich funding summary
            summary_rows = build_funding_summary_rows(legislators, cand_totals, cycle)
            enrich_with_ie_totals(summary_rows, legislators, cycle)
            enrich_with_geo(summary_rows, geo_by_leg)

            log.info("Upserting %d funding summary rows for cycle %d…", len(summary_rows), cycle)
            for chunk in batch(summary_rows, UPSERT_BATCH):
                upsert("legislator_funding_summary", chunk)
            results[f"funding_summary_{cycle}"] = len(summary_rows)

            # Step 6: Compute and upsert top PACs
            top_pacs = compute_top_pacs_from_supabase(legislators, cycle)
            log.info("Upserting %d top PAC rows for cycle %d…", len(top_pacs), cycle)
            for chunk in batch(top_pacs, UPSERT_BATCH):
                upsert("legislator_top_pacs", chunk)
            results[f"top_pacs_{cycle}"] = len(top_pacs)

            # Step 7: Compute and upsert top contributors
            top_contribs = build_top_contributors(emp_by_leg, legislators, cycle)
            log.info("Upserting %d top contributor rows for cycle %d…", len(top_contribs), cycle)
            for chunk in batch(top_contribs, UPSERT_BATCH):
                upsert("legislator_top_contributors", chunk)
            results[f"top_contributors_{cycle}"] = len(top_contribs)

        log.info("All FEC sync complete: %s", results)
        log_run_end(run_id, "success", results)

    except Exception as e:
        log.exception("%s failed", SCRIPT)
        log_run_end(run_id, "failed", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync FEC data via OpenFEC API")
    parser.add_argument(
        "--cycles", type=int, nargs="+", default=None,
        help=f"FEC election cycles to sync (default: active cycles from {FEC_CYCLES})"
    )
    args = parser.parse_args()
    run(cycles=args.cycles)
