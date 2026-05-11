"""Agentic workflow to populate the entire database for 119th Congress (2025-2026).

Handles dependencies, retries, storage limits, and progress tracking.
Designed for Supabase free tier (500MB).

Usage: cd pipeline && uv run python -m scripts.populate_db [--force] [--skip-enrichment]
"""
import argparse
import os
import sys
import subprocess
import time
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv()

from shared.observability import configure_logging
from shared.db import get_supabase, get_conn, log_run_start, log_run_end

import structlog

configure_logging(service="pipeline", debug=True)
log = structlog.get_logger()

DATA_DIR = Path(__file__).parent.parent / "data"
CONGRESS = 119
FEC_CYCLES = [2024, 2026]
STORAGE_LIMIT_MB = 450  # Leave 50MB headroom on 500MB free tier
USC_RUN_DIR = (DATA_DIR / "congress-scraper").resolve()


# ─── Storage check ────────────────────────────────────────────────────────────

def get_storage_mb() -> float:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("""
        SELECT COALESCE(SUM(pg_total_relation_size(schemaname || '.' || tablename)), 0)
        FROM pg_tables
        WHERE schemaname IN ('congress','fec','enrichment','analytics','anomalies','app','derived','ops')
    """)
    total_bytes = cur.fetchone()[0]
    conn.close()
    return total_bytes / 1024 / 1024


def check_storage(label: str) -> bool:
    mb = get_storage_mb()
    log.info("storage_check", label=label, used_mb=round(mb, 1), limit_mb=STORAGE_LIMIT_MB)
    if mb > STORAGE_LIMIT_MB:
        log.warning("storage_limit_reached", used_mb=round(mb, 1))
        return False
    return True


def get_row_count(schema: str, table: str) -> int:
    client = get_supabase()
    result = client.schema(schema).table(table).select("*", count="exact", head=True).execute()
    return result.count or 0


# ─── Step functions ───────────────────────────────────────────────────────────

def step_legislators():
    """Load current + historical legislators from congress-legislators YAML."""
    existing = get_row_count("congress", "legislators")
    if existing > 10000:
        log.info("legislators_already_loaded", count=existing)
        return

    from ingest.legislators import sync, load_current, load_committee_memberships
    from load.legislators import load_legislators, load_committee_memberships as upload_memberships
    import yaml

    repo_dir = sync(DATA_DIR)
    current = load_current(repo_dir)
    count = load_legislators(current, [])  # Current only — saves storage
    log.info("legislators_loaded", count=count)

    # Load committees
    with open(repo_dir / "committees-current.yaml") as f:
        committees = yaml.safe_load(f)

    seen = set()
    parents, children = [], []
    for cmte in committees:
        thomas_id = cmte.get("thomas_id")
        if not thomas_id or thomas_id in seen:
            continue
        seen.add(thomas_id)
        cmte_type = cmte.get("type", "")
        chamber = "Senate" if cmte_type == "senate" else "House" if cmte_type == "house" else cmte_type
        parents.append({"thomas_id": thomas_id, "name": cmte.get("name", ""), "chamber": chamber,
                        "committee_type": cmte_type, "parent_id": None, "url": cmte.get("url")})
        for sub in cmte.get("subcommittees", []):
            sub_id = sub.get("thomas_id")
            if sub_id and sub_id not in seen:
                seen.add(sub_id)
                children.append({"thomas_id": sub_id, "name": sub.get("name", ""), "chamber": chamber,
                                 "committee_type": "subcommittee", "parent_id": thomas_id, "url": sub.get("url")})

    from shared.db import upsert
    upsert("committees", parents, on_conflict="thomas_id", schema="congress")
    upsert("committees", children, on_conflict="thomas_id", schema="congress")
    log.info("committees_loaded", parents=len(parents), children=len(children))

    # Committee memberships (filtered to valid committees)
    valid_ids = {r["thomas_id"] for p in [parents, children] for r in p}
    memberships = load_committee_memberships(repo_dir)
    rows = []
    seen_keys = set()
    for committee_id, members in memberships.items():
        if committee_id not in valid_ids:
            continue
        for member in members:
            bioguide = member.get("bioguide")
            if not bioguide:
                continue
            key = (bioguide, committee_id)
            if key not in seen_keys:
                seen_keys.add(key)
                rows.append({"bioguide_id": bioguide, "committee_id": committee_id,
                             "rank": member.get("rank"), "role": member.get("title")})
    upsert("committee_memberships", rows, on_conflict="bioguide_id,committee_id", schema="congress")
    log.info("committee_memberships_loaded", count=len(rows))


def step_voteview():
    """Load VoteView NOMINATE ideology scores."""
    existing = get_row_count("congress", "member_scores")
    if existing > 1000:
        log.info("voteview_already_loaded", count=existing)
        return

    from ingest.voteview import download_scores, parse_scores
    from load.scores import load_scores

    csv_path = download_scores(DATA_DIR)
    records = parse_scores(csv_path)

    # Build ICPSR -> bioguide lookup (current legislators only)
    from ingest.legislators import sync, load_current
    repo_dir = sync(DATA_DIR)
    current = load_current(repo_dir)
    icpsr_map = {}
    for rec in current:
        ids = rec.get("id", {})
        if ids.get("bioguide") and ids.get("icpsr"):
            icpsr_map[str(ids["icpsr"])] = ids["bioguide"]

    count = load_scores(records, icpsr_map)
    log.info("voteview_loaded", count=count)


def step_bills():
    """Download and load all bills for the 119th Congress."""
    existing = get_row_count("congress", "bills")
    if existing > 3000:
        log.info("bills_already_loaded", count=existing)
        return

    # Ensure usc-run is set up
    from ingest.congress import setup
    repo = setup(DATA_DIR)

    # Download bulk bill status from GovInfo (all bill types)
    log.info("downloading_govinfo_billstatus", congress=CONGRESS)
    subprocess.run(
        [str(repo / "env" / "bin" / "usc-run"), "govinfo",
         "--bulkdata=BILLSTATUS", f"--congress={CONGRESS}", "--log=info"],
        cwd=str(repo), check=True, timeout=1800,
    )

    # Convert bulk XML to JSON
    log.info("converting_bills_to_json", congress=CONGRESS)
    subprocess.run(
        [str(repo / "env" / "bin" / "usc-run"), "bills",
         f"--congress={CONGRESS}", "--log=info"],
        cwd=str(repo), check=True, timeout=600,
    )

    # Count and load
    from ingest.congress import iter_bill_jsons
    from load.bills import load_bills

    bill_jsons = list(iter_bill_jsons(repo, CONGRESS))
    log.info("bills_found", count=len(bill_jsons))

    if bill_jsons:
        count = load_bills(bill_jsons)
        log.info("bills_loaded", count=count)
    else:
        log.warning("no_bills_found")


def step_votes():
    """Download and load all votes for the 119th Congress."""
    existing = get_row_count("congress", "bill_vote_summaries")
    if existing > 500:
        log.info("votes_already_loaded", count=existing)
        return

    from ingest.congress import setup
    repo = setup(DATA_DIR)

    # Fetch votes (House + Senate)
    log.info("fetching_votes", congress=CONGRESS)
    subprocess.run(
        [str(repo / "env" / "bin" / "usc-run"), "votes",
         f"--congress={CONGRESS}", "--log=info"],
        cwd=str(repo), check=True, timeout=1800,
    )

    from ingest.congress import iter_vote_jsons
    from load.votes import load_votes

    vote_jsons = list(iter_vote_jsons(repo, CONGRESS))
    log.info("votes_found", count=len(vote_jsons))

    if vote_jsons:
        s_count, p_count = load_votes(vote_jsons)
        log.info("votes_loaded", summaries=s_count, positions=p_count)


def step_fec():
    """Download FEC bulk files, convert to Parquet, upload PAC + IE + committee names."""
    if not check_storage("pre_fec"):
        return

    from ingest.fec import download_and_convert_cycle
    from load.fec import load_pac_contributions, load_ie_contributions, load_committee_names

    for cycle in FEC_CYCLES:
        # Check per-cycle, not table-wide
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM fec.pac_to_candidate WHERE cycle = %s", (cycle,))
        existing_pac = cur.fetchone()[0]
        if existing_pac > 10000:
            log.info("fec_cycle_already_loaded", cycle=cycle, pac_rows=existing_pac)
            continue

        if not check_storage(f"fec_cycle_{cycle}"):
            log.warning("skipping_fec_cycle_storage", cycle=cycle)
            break

        log.info("processing_fec_cycle", cycle=cycle)
        paths = download_and_convert_cycle(cycle, DATA_DIR)

        pac_count = load_pac_contributions(paths["pas2"], cycle)
        log.info("pac_loaded", cycle=cycle, count=pac_count)

        ie_count = load_ie_contributions(paths["pas2"], cycle)
        log.info("ie_loaded", cycle=cycle, count=ie_count)

        cmte_count = load_committee_names(paths["cm"])
        log.info("cmte_names_loaded", cycle=cycle, count=cmte_count)


def step_bill_embeddings():
    """Generate bill embeddings for semantic search."""
    if not check_storage("pre_embeddings"):
        return

    existing = get_row_count("enrichment", "bill_embeddings")
    bill_count = get_row_count("congress", "bills")
    if existing >= bill_count * 0.9:
        log.info("embeddings_already_loaded", existing=existing, bills=bill_count)
        return

    from load.embeddings import load_bill_embeddings
    count = load_bill_embeddings()
    log.info("bill_embeddings_loaded", count=count)


def step_enrichment():
    """Run ML Tier 1 enrichment (employer normalization + industry classification only).

    Skips donor resolution and address standardization to save storage.
    These are the largest tables and would blow past the 500MB free tier
    on full FEC individual contributions.
    """
    if not check_storage("pre_enrichment"):
        return

    # Clear old partial enrichment data to reclaim space
    client = get_supabase()
    old_donor_count = get_row_count("enrichment", "donor_canonical")
    if old_donor_count > 0:
        log.info("clearing_old_donor_canonical", rows=old_donor_count)
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute("TRUNCATE enrichment.donor_canonical")
        conn.close()
        log.info("donor_canonical_cleared")

    # Employer normalization (small — only unique employer strings)
    for cycle in FEC_CYCLES:
        indiv_parquet = DATA_DIR / "fec" / str(cycle) / "indiv.parquet"
        if not indiv_parquet.exists():
            log.warning("indiv_parquet_missing", cycle=cycle)
            continue

        if not check_storage(f"employer_norm_{cycle}"):
            break

        from enrich.employer_normalization import run_employer_normalization
        count = run_employer_normalization(indiv_parquet)
        log.info("employer_normalization_done", cycle=cycle, count=count)

    # Industry classification via OpenSecrets CRP taxonomy
    if check_storage("industry_classification"):
        from enrich.opensecrets import run_industry_classification_opensecrets
        count = run_industry_classification_opensecrets(DATA_DIR)
        log.info("industry_classification_done", count=count)


def step_anomaly_detection():
    """Run ML Tier 3 anomaly detection (suspicious clusters + change detection)."""
    if not check_storage("pre_anomalies"):
        return

    for cycle in FEC_CYCLES:
        indiv_parquet = DATA_DIR / "fec" / str(cycle) / "indiv.parquet"
        pas2_parquet = DATA_DIR / "fec" / str(cycle) / "pas2.parquet"

        if indiv_parquet.exists():
            if not check_storage(f"suspicious_{cycle}"):
                break
            from enrich.suspicious_clusters import run_suspicious_clusters
            count = run_suspicious_clusters(indiv_parquet)
            log.info("suspicious_clusters_done", cycle=cycle, count=count)

        if pas2_parquet.exists():
            if not check_storage(f"change_detection_{cycle}"):
                break
            from enrich.change_detection import run_change_detection
            count = run_change_detection(pas2_parquet)
            log.info("change_detection_done", cycle=cycle, count=count)


# ─── Main orchestrator ────────────────────────────────────────────────────────

STEPS = [
    ("legislators", step_legislators, "Load legislators, committees, memberships"),
    ("voteview", step_voteview, "Load VoteView NOMINATE ideology scores"),
    ("bills", step_bills, "Download + load 119th Congress bills via usc-run"),
    ("votes", step_votes, "Download + load 119th Congress votes via usc-run"),
    ("fec", step_fec, "Download + load FEC campaign finance data"),
    ("bill_embeddings", step_bill_embeddings, "Generate bill embeddings for semantic search"),
    ("enrichment", step_enrichment, "ML employer normalization + industry classification"),
    ("anomaly_detection", step_anomaly_detection, "Tier 3 anomaly detection (suspicious clusters + change points)"),
]


def main():
    parser = argparse.ArgumentParser(description="Populate Beyond the Ballot database")
    parser.add_argument("--force", action="store_true", help="Skip 'already loaded' checks")
    parser.add_argument("--skip-enrichment", action="store_true", help="Skip ML enrichment steps")
    parser.add_argument("--only", type=str, help="Run only this step (comma-separated)")
    parser.add_argument("--skip", type=str, help="Skip these steps (comma-separated)")
    args = parser.parse_args()

    skip_steps = set(args.skip.split(",")) if args.skip else set()
    only_steps = set(args.only.split(",")) if args.only else None
    if args.skip_enrichment:
        skip_steps.add("enrichment")

    run_id = log_run_start("populate_db")
    total_rows = 0
    failed_steps = []

    log.info("populate_db_starting",
             congress=CONGRESS, fec_cycles=FEC_CYCLES,
             storage_mb=round(get_storage_mb(), 1))

    for step_name, step_fn, description in STEPS:
        if only_steps and step_name not in only_steps:
            continue
        if step_name in skip_steps:
            log.info("step_skipped", step=step_name)
            continue

        log.info("step_starting", step=step_name, description=description)
        start = time.time()

        try:
            step_fn()
            elapsed = time.time() - start
            storage = get_storage_mb()
            log.info("step_completed", step=step_name,
                     elapsed_s=round(elapsed, 1), storage_mb=round(storage, 1))
        except Exception as e:
            elapsed = time.time() - start
            log.error("step_failed", step=step_name, error=str(e), elapsed_s=round(elapsed, 1))
            failed_steps.append(step_name)
            # Continue to next step — don't abort the whole pipeline
            continue

    final_storage = get_storage_mb()
    status = "success" if not failed_steps else "partial"
    log_run_end(run_id, status, rows_processed=total_rows,
                metadata={"failed_steps": failed_steps, "storage_mb": round(final_storage, 1)})

    log.info("populate_db_complete",
             status=status, failed=failed_steps,
             storage_mb=round(final_storage, 1))

    if failed_steps:
        print(f"\nWarning: {len(failed_steps)} steps failed: {', '.join(failed_steps)}")
        print("Re-run with: uv run python -m scripts.populate_db --only=" + ",".join(failed_steps))
        sys.exit(1)


if __name__ == "__main__":
    main()
