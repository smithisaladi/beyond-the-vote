"""Tier 1b: Light donor dedup via exact-match entity resolution.

Runs on standard GitHub Actions runners — no ML models required.
Groups individual FEC contributions by exact (name, employer, zip5) key,
aggregates totals, and writes canonical donor rows to enrichment.donor_canonical.

Only donors with total contributions >= $200 are stored (FEC itemization threshold).

Usage:
    cd pipeline && uv run python -m scripts.enrich_donors_light [--cycles 2024,2026]
"""
import argparse
import sys
import time
from collections import defaultdict
from pathlib import Path

import structlog
from dotenv import load_dotenv

load_dotenv()

from config import FEC_CYCLES
from shared.db import get_conn, log_run_start, log_run_end, reset_conn, upsert
from shared.freshness import record_freshness
from shared.metrics import record_step_metrics
from shared.observability import configure_logging, configure_sentry
from shared.parquet import read_parquet_batched, duckdb_connect

# FEC bulk parquet lives under data/fec/<cycle>/, matching the producer
# (ingest.fec.download_and_convert_all) and the other enrichment scripts.
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

SCRIPT = "enrich_donors_light"
MODEL_VERSION = "exact-match-v1"
MIN_TOTAL_AMOUNT = 200  # FEC itemization threshold

log = structlog.get_logger()


def exact_match_dedup(donors: list[dict]) -> list[dict]:
    """Resolve donors into canonical entities via exact (name, employer, zip5) match.

    Input dicts must have keys: name, employer, zip5, amount, cmte_id, sub_id
    Returns list of canonical donor dicts with aggregated totals.
    """
    # Group by exact (name_lower, employer_lower, zip5[:5])
    groups: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
    for donor in donors:
        name_key = (donor.get("name") or "").strip().lower()
        employer_key = (donor.get("employer") or "").strip().lower()
        zip_key = str(donor.get("zip5") or "")[:5]
        groups[(name_key, employer_key, zip_key)].append(donor)

    canonical: list[dict] = []
    for (name_key, employer_key, zip_key), members in groups.items():
        total_amount = sum(float(m.get("amount") or 0) for m in members)

        # Skip groups below the FEC itemization threshold
        if total_amount < MIN_TOTAL_AMOUNT:
            continue

        contribution_count = len(members)
        cmte_ids = sorted({str(m.get("cmte_id") or "") for m in members if m.get("cmte_id")})

        # Prefer the member with the longest name (most complete form)
        best = max(members, key=lambda m: len(str(m.get("name") or "")))
        display_name = str(best.get("name") or "")
        employer = str(best.get("employer") or "") or None

        # Canonical ID uses the lowest sub_id in the group
        min_sub_id = min(int(m["sub_id"]) for m in members)
        canonical_id = f"exact-{min_sub_id}"

        canonical.append({
            "canonical_id": canonical_id,
            "display_name": display_name,
            "employer": employer,
            "zip5": zip_key if zip_key else None,
            "total_amount": round(total_amount, 2),
            "contribution_count": contribution_count,
            "cmte_ids": cmte_ids,
            "confidence": 0.7,
            "resolution_method": "exact",
            "model_version": MODEL_VERSION,
        })

    return canonical


def load_donors_from_parquet(parquet_path: Path, cmte_ids: set[str]) -> list[dict]:
    """Stream donors from a parquet file, filtering to tracked committees."""
    donors: list[dict] = []
    for batch in read_parquet_batched(parquet_path, batch_size=100_000):
        for row in batch:
            entity_tp = str(row.get("entity_tp") or "")
            if entity_tp != "IND":
                continue

            cmte_id = str(row.get("cmte_id") or "")
            if cmte_id not in cmte_ids:
                continue

            try:
                amount = float(row.get("transaction_amt") or 0)
            except (ValueError, TypeError):
                continue
            if amount <= 0:
                continue

            sub_id_raw = row.get("sub_id")
            try:
                sub_id = int(sub_id_raw) if sub_id_raw is not None else None
            except (ValueError, TypeError):
                sub_id = None
            if sub_id is None:
                continue

            zip_code = str(row.get("zip_code") or "")
            donors.append({
                "sub_id": sub_id,
                "name": str(row.get("name") or ""),
                "employer": str(row.get("employer") or ""),
                "city": str(row.get("city") or ""),
                "state": str(row.get("state") or ""),
                "zip5": zip_code[:5],
                "cmte_id": cmte_id,
                "amount": amount,
            })

    log.info("donors_loaded_from_parquet", path=str(parquet_path), count=len(donors))
    return donors


def get_tracked_cmte_ids() -> set[str]:
    """Return set of committee IDs linked to tracked legislators via FEC linkage data."""
    conn = get_conn()
    cur = conn.cursor()

    # Get all FEC candidate IDs from tracked legislators
    cur.execute("SELECT unnest(fec_ids) AS fec_id FROM congress.legislators WHERE fec_ids IS NOT NULL")
    cand_ids = {row[0] for row in cur.fetchall() if row[0]}

    if not cand_ids:
        log.warning("no_tracked_fec_ids")
        return set()

    log.info("tracked_fec_cand_ids", count=len(cand_ids))

    # Load committee-candidate linkage via DuckDB from the committee-master parquet
    cm_parquets = [DATA_DIR / "fec" / str(c) / "cm.parquet" for c in FEC_CYCLES]
    cm_parquets = [p for p in cm_parquets if p.exists()]
    if not cm_parquets:
        log.warning("cm_parquet_missing", searched=str(DATA_DIR / "fec" / "*" / "cm.parquet"))
        return set()

    # Build SQL IN / file lists safely from trusted internal values
    cand_id_list = ", ".join(f"'{c}'" for c in cand_ids)
    files_sql = ", ".join(f"'{p}'" for p in cm_parquets)

    with duckdb_connect() as duck:
        rows = duck.execute(f"""
            SELECT DISTINCT cmte_id
            FROM read_parquet([{files_sql}])
            WHERE cand_id IN ({cand_id_list})
              AND cmte_id IS NOT NULL
              AND cmte_id != ''
        """).fetchall()

    cmte_ids = {row[0] for row in rows}
    log.info("tracked_cmte_ids", count=len(cmte_ids))
    return cmte_ids


def main() -> None:
    parser = argparse.ArgumentParser(description="Light donor dedup via exact-match resolution.")
    parser.add_argument(
        "--cycles",
        type=str,
        default=",".join(str(c) for c in FEC_CYCLES),
        help="Comma-separated FEC cycles (e.g. 2024,2026)",
    )
    args = parser.parse_args()
    cycles = [int(c) for c in args.cycles.split(",")]

    configure_logging(service="pipeline")
    configure_sentry(service="pipeline")

    run_id = log_run_start(SCRIPT)
    start_time = time.monotonic()

    try:
        cmte_ids = get_tracked_cmte_ids()
        if not cmte_ids:
            log.warning("no_tracked_committees_skipping")
            log_run_end(run_id, "success", rows_processed=0)
            return

        all_donors: list[dict] = []
        for cycle in cycles:
            parquet_path = DATA_DIR / "fec" / str(cycle) / "indiv.parquet"
            if not parquet_path.exists():
                log.warning("indiv_parquet_missing", cycle=cycle, path=str(parquet_path))
                continue
            log.info("loading_donors", cycle=cycle)
            all_donors.extend(load_donors_from_parquet(parquet_path, cmte_ids))

        log.info("all_donors_loaded", total=len(all_donors))

        if not all_donors:
            log.warning("no_donors_found")
            log_run_end(run_id, "success", rows_processed=0)
            return

        # Reset DB connection before long in-memory processing (avoid Neon idle timeout)
        reset_conn()

        canonical = exact_match_dedup(all_donors)
        log.info("dedup_complete", canonical_donors=len(canonical))

        total_upserted = 0
        batch_size = 5000
        for i in range(0, len(canonical), batch_size):
            chunk = canonical[i : i + batch_size]
            upsert("donor_canonical", chunk, on_conflict="canonical_id", schema="enrichment")
            total_upserted += len(chunk)
            log.info("donors_upserted", rows=total_upserted)

        record_freshness("enrichment", "donor_canonical", rows_affected=total_upserted, run_id=run_id)

        duration = time.monotonic() - start_time
        record_step_metrics(
            run_id=run_id,
            script_name=SCRIPT,
            rows_ingested=len(all_donors),
            rows_upserted=total_upserted,
            rows_dead_lettered=0,
            duration_seconds=round(duration, 1),
        )

        log_run_end(run_id, "success", rows_processed=total_upserted)
        log.info("enrich_donors_light_complete", total=total_upserted)

    except Exception as e:
        log.error("enrich_donors_light_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
