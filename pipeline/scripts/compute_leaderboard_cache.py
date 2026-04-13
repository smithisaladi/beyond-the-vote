"""
compute_leaderboard_cache.py — Build the contributor leaderboard cache by
aggregating pac_to_candidate + independent_expenditures directly from Supabase.

No local file I/O, no DuckDB — designed to run on ephemeral CI runners as a
weekly cron job after sync_fec.py has refreshed the PAC/IE tables.

Rows in contributor_leaderboard_cache are fully replaced each run.

Usage:
    python -m scripts.compute_leaderboard_cache
"""

import logging
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import FEC_CYCLES, UPSERT_BATCH
from load import log_run_end, log_run_start
from utils import batch, get_supabase

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

SCRIPT = "compute_leaderboard_cache"
PAGE = 1000
TOP_RECIPIENTS = 5

# Pass-through / party committees — excluded from the leaderboard
SKIP_NAMES = {
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


# ── Supabase pagination ───────────────────────────────────────────────────────


def _fetch_all(table: str, columns: str, filters: dict | None = None) -> list[dict]:
    """Paginate a Supabase table fully into memory."""
    db = get_supabase()
    rows: list[dict] = []
    offset = 0
    while True:
        q = db.table(table).select(columns)
        for col, val in (filters or {}).items():
            if isinstance(val, (list, tuple, set)):
                q = q.in_(col, list(val))
            else:
                q = q.eq(col, val)
        res = q.range(offset, offset + PAGE - 1).execute()
        rows.extend(res.data)
        if len(res.data) < PAGE:
            break
        offset += PAGE
    return rows


def _load_legislators() -> dict[str, dict]:
    rows = _fetch_all(
        "legislators",
        "bioguide_id,full_name,party,state,chamber,fec_ids",
    )
    return {r["bioguide_id"]: r for r in rows}


def _load_cmte_names() -> dict[str, str]:
    """cmte_id → cmte_name. fec_cmte_names is small."""
    rows = _fetch_all("fec_cmte_names", "cmte_id,cmte_name")
    return {r["cmte_id"]: r["cmte_name"] for r in rows if r.get("cmte_name")}


# ── Aggregation ──────────────────────────────────────────────────────────────


def compute_leaderboard(cycles: list[int]) -> list[dict]:
    legislators = _load_legislators()
    log.info("Loaded %d legislators", len(legislators))

    # fec_id → bioguide_id
    fec_to_bio: dict[str, str] = {}
    for bid, leg in legislators.items():
        for fec_id in (leg.get("fec_ids") or []):
            fec_to_bio[fec_id] = bid

    known_cands = set(fec_to_bio.keys())
    if not known_cands:
        log.warning("No fec_ids found on legislators — nothing to aggregate")
        return []

    cmte_names = _load_cmte_names()
    log.info("Loaded %d committee name mappings", len(cmte_names))

    # (cmte_id, cand_id) → {direct, ie_for, ie_against}
    per_pair: dict[tuple[str, str], dict[str, float]] = defaultdict(
        lambda: {"direct": 0.0, "ie_for": 0.0, "ie_against": 0.0}
    )

    # PAC direct contributions
    pac_rows = _fetch_all(
        "pac_to_candidate",
        "cmte_id,cand_id,transaction_amt",
        filters={"cycle": cycles},
    )
    log.info("Fetched %d pac_to_candidate rows", len(pac_rows))
    for r in pac_rows:
        cand = r.get("cand_id")
        cmte = r.get("cmte_id")
        if not cand or not cmte or cand not in known_cands:
            continue
        per_pair[(cmte, cand)]["direct"] += float(r.get("transaction_amt") or 0)

    # Independent expenditures
    ie_rows = _fetch_all(
        "independent_expenditures",
        "cmte_id,cand_id,sup_opp,transaction_amt",
        filters={"cycle": cycles},
    )
    log.info("Fetched %d independent_expenditures rows", len(ie_rows))
    for r in ie_rows:
        cand = r.get("cand_id")
        cmte = r.get("cmte_id")
        if not cand or not cmte or cand not in known_cands:
            continue
        amt = float(r.get("transaction_amt") or 0)
        if (r.get("sup_opp") or "").upper() == "S":
            per_pair[(cmte, cand)]["ie_for"] += amt
        elif (r.get("sup_opp") or "").upper() == "O":
            per_pair[(cmte, cand)]["ie_against"] += amt

    # Aggregate per committee + collect recipients
    per_cmte: dict[str, dict[str, float]] = defaultdict(
        lambda: {
            "direct_total": 0.0,
            "ie_for_total": 0.0,
            "ie_against_total": 0.0,
            "recipients": [],  # list of dicts
        }
    )

    for (cmte, cand), sums in per_pair.items():
        direct = sums["direct"]
        ie_for = sums["ie_for"]
        ie_against = sums["ie_against"]
        total_support = direct + ie_for

        agg = per_cmte[cmte]
        agg["direct_total"] += direct
        agg["ie_for_total"] += ie_for
        agg["ie_against_total"] += ie_against

        if total_support > 0:
            agg["recipients"].append({
                "bioguide_id": fec_to_bio[cand],
                "direct": direct,
                "ie_for": ie_for,
                "amount": total_support,
            })

    # Build output rows
    result: list[dict] = []
    for cmte_id, agg in per_cmte.items():
        name = cmte_names.get(cmte_id, cmte_id)
        if name.upper().strip() in SKIP_NAMES:
            continue

        total_contributions = agg["direct_total"] + agg["ie_for_total"]
        if total_contributions <= 0:
            continue

        recipients = sorted(agg["recipients"], key=lambda r: r["amount"], reverse=True)
        enriched = []
        for r in recipients[:TOP_RECIPIENTS]:
            leg = legislators.get(r["bioguide_id"], {})
            enriched.append({
                "bioguide_id": r["bioguide_id"],
                "name":        leg.get("full_name", r["bioguide_id"]),
                "party":       leg.get("party", ""),
                "state":       leg.get("state", ""),
                "chamber":     leg.get("chamber", ""),
                "amount":      r["amount"],
                "direct":      r["direct"],
                "ie_for":      r["ie_for"],
            })

        result.append({
            "cmte_id":             cmte_id,
            "cmte_name":           name,
            "direct_total":        agg["direct_total"],
            "ie_for_total":        agg["ie_for_total"],
            "ie_against_total":    agg["ie_against_total"],
            "total_contributions": total_contributions,
            "recipient_count":     len(agg["recipients"]),
            "top_recipients":      enriched,
        })

    result.sort(key=lambda r: r["total_contributions"], reverse=True)
    log.info("Leaderboard: %d committees after filtering", len(result))
    return result


# ── Entrypoint ───────────────────────────────────────────────────────────────


def main() -> None:
    run_id = log_run_start(SCRIPT)
    try:
        rows = compute_leaderboard(FEC_CYCLES)

        db = get_supabase()

        # Clear existing cache, then insert fresh
        db.table("contributor_leaderboard_cache").delete().neq("cmte_id", "").execute()
        log.info("Cleared existing cache rows")

        stored = 0
        for chunk in batch(rows, UPSERT_BATCH):
            db.table("contributor_leaderboard_cache").insert(chunk).execute()
            stored += len(chunk)
            log.info("Inserted %d/%d rows", stored, len(rows))

        log_run_end(run_id, "success", result={"rows_written": stored})
        log.info("Done — %d rows in contributor_leaderboard_cache", stored)
    except Exception as exc:
        log.exception("compute_leaderboard_cache failed")
        log_run_end(run_id, "failed", error=str(exc))
        sys.exit(1)


if __name__ == "__main__":
    main()
