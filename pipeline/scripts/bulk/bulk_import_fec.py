"""
bulk_import_fec.py — Load all FEC tables from bulk data files.

Processes in dependency order for each cycle:
  1. candidates             (cn{yy}.zip)   → local CSV only
  2. fec_committees         (cm{yy}.zip)   → local CSV only
  3. candidate_summaries    (webl{yy}.zip) → local CSV only
  4. ccl linkages           (ccl{yy}.zip)  — in-memory only
  5. pac_to_candidate + independent_expenditures (pas2{yy}.zip) → Supabase + CSV
  6. individual_contributions (indiv{yy}.zip) — local CSV only, streaming, filtered

Active cycle detection: if today's year <= cycle year → active cycle.
Active cycles: fresh download of indiv + pas2 before processing.
Historical cycles: use cached zips.

Usage:
    python3 scripts/bulk/bulk_import_fec.py
    python3 scripts/bulk/bulk_import_fec.py --cycles 2024 2026
"""

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2]))

from config import (
    CAND_SUMMARY_CSV_COLS,
    CANDIDATES_CSV_COLS,
    CCL_COLS,
    CHUNK_SIZE,
    CM_COLS,
    CN_COLS,
    COMMITTEES_CSV_COLS,
    DATA_PROCESSED_FEC,
    DATA_RAW,
    FEC_CYCLES,
    IE_CSV_COLS,
    INDIV_COLS,
    INDIV_CSV_COLS,
    PAC_CSV_COLS,
    PAS2_COLS,
    UPSERT_BATCH,
    WEBL_COLS,
    is_active_cycle,
)
from load import (
    checkpoint_exists,
    get_last_checkpoint,
    log_run_end,
    log_run_start,
    mark_checkpoint,
    upsert,
)
from transform.candidate_summaries import transform_candidate_summaries_batch
from transform.candidates import transform_candidates_batch
from transform.committees import transform_committees_batch
from transform.ind_exp import transform_independent_expenditures_batch
from transform.individuals import transform_individuals_batch
from transform.pac_to_cand import transform_pac_contributions_batch
from utils import append_csv, batch, download_file, extract_zip, get_supabase, stream_fec_file, stream_fec_file_rows

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

SCRIPT = "bulk_import_fec"

# FEC bulk data download base URLs
FEC_DOWNLOAD_BASE = "https://www.fec.gov/files/bulk-downloads"

FEC_FILES = {
    "cn":    ("cn{yy}.zip",    "cn{yy}.txt"),
    "cm":    ("cm{yy}.zip",    "cm{yy}.txt"),
    "ccl":   ("ccl{yy}.zip",   "ccl{yy}.txt"),
    "indiv": ("indiv{yy}.zip", "indiv{yy}.txt"),
    "pas2":  ("itpas2{yy}.zip", "itpas2{yy}.txt"),  # FEC uses itpas2 naming
    "webl":  ("webl{yy}.zip",  "webl{yy}.txt"),     # candidate financial summary
    "webk":  ("webk{yy}.zip",  "webk{yy}.txt"),     # committee financial summary
}

# Alternative pas2 naming (FEC changed conventions across cycles)
PAS2_ALT_ZIPS = ["pas2{yy}.zip", "itpas2{yy}.zip"]


def fec_zip_path(cycle: int, file_key: str) -> Path:
    yy = str(cycle)[-2:]
    zip_name, _ = FEC_FILES[file_key]
    zip_name = zip_name.replace("{yy}", yy)
    return DATA_RAW / "fec" / str(cycle) / zip_name


def find_zip(cycle: int, file_key: str) -> Path | None:
    """Find the zip file, trying multiple naming conventions."""
    yy = str(cycle)[-2:]
    dir_ = DATA_RAW / "fec" / str(cycle)
    candidates = []
    if file_key == "pas2":
        for pattern in PAS2_ALT_ZIPS:
            candidates.append(dir_ / pattern.replace("{yy}", yy))
    else:
        zip_name, _ = FEC_FILES[file_key]
        candidates.append(dir_ / zip_name.replace("{yy}", yy))

    for p in candidates:
        if p.exists():
            return p
    return None


def ensure_zip(cycle: int, file_key: str, active: bool) -> Path | None:
    """
    Return path to zip file, downloading if needed.
    Active cycles re-download indiv and pas2 for fresh data.
    """
    zip_path = find_zip(cycle, file_key)
    if zip_path and zip_path.exists():
        if active and file_key in ("indiv", "pas2"):
            log.info("Active cycle %d — re-downloading %s for fresh data", cycle, file_key)
            # Fall through to download
        else:
            log.info("Using cached %s", zip_path.name)
            return zip_path

    # Download from FEC
    yy = str(cycle)[-2:]
    zip_name, _ = FEC_FILES[file_key]
    zip_name = zip_name.replace("{yy}", yy)
    url = f"{FEC_DOWNLOAD_BASE}/{cycle}/{zip_name}"
    dest = DATA_RAW / "fec" / str(cycle) / zip_name

    try:
        return download_file(url, dest)
    except Exception as e:
        log.error("Failed to download %s: %s", url, e)
        # Try alternative URL format
        alt_url = f"{FEC_DOWNLOAD_BASE}/{yy}/{zip_name}"
        try:
            return download_file(alt_url, dest)
        except Exception as e2:
            log.error("Also failed alternate URL %s: %s", alt_url, e2)
            return None


def _clear_csv_if_fresh(source_file: str, csv_path: Path) -> None:
    """Delete existing CSV if no checkpoints exist (fresh run).
    Also clears stale checkpoints if CSV is missing (e.g. from pre-DuckDB runs)."""
    last = get_last_checkpoint(SCRIPT, source_file)
    if last >= 0 and not csv_path.exists():
        # Checkpoints exist from a previous run but CSV was never written
        # (pre-DuckDB runs wrote to Supabase only). Clear checkpoints to re-process.
        log.info("Clearing stale checkpoints for %s (no CSV exists)", source_file)
        db = get_supabase()
        db.table("bulk_import_checkpoints").delete().eq("script", SCRIPT).eq("source_file", source_file).execute()
    elif last < 0 and csv_path.exists():
        csv_path.unlink()
        log.info("Cleared stale CSV %s for fresh run", csv_path.name)


# ── Build legislator committee filter set ─────────────────────────────────────

def build_legislator_cmte_ids(cycles: list[int]) -> set[str]:
    """
    Build the set of FEC committee IDs linked to tracked legislators.
    Filter individual_contributions to only these committees.

    Reads legislators from Supabase, candidates + committees from local CSVs.
    """
    db = get_supabase()

    # Get legislators' FEC IDs from Supabase
    leg_fec_ids: set[str] = set()
    offset = 0
    while True:
        res = db.table("legislators").select("fec_ids").range(offset, offset + 999).execute()
        for row in res.data:
            for fid in (row.get("fec_ids") or []):
                leg_fec_ids.add(fid)
        if len(res.data) < 1000:
            break
        offset += 1000

    # Read candidates from local CSVs
    all_cand_pccs: dict[str, str] = {}
    for cycle in cycles:
        cand_csv = DATA_PROCESSED_FEC / f"candidates_{cycle}.csv"
        if not cand_csv.exists():
            log.warning("Candidates CSV not found: %s", cand_csv)
            continue
        import csv as csv_mod
        with open(cand_csv, encoding="utf-8") as f:
            reader = csv_mod.DictReader(f, delimiter="|")
            for row in reader:
                cand_id = row.get("cand_id", "")
                pcc = row.get("cand_pcc", "")
                if cand_id and pcc:
                    all_cand_pccs[cand_id] = pcc

    # Read committees from local CSV
    cmte_csv = DATA_PROCESSED_FEC / "committees.csv"
    committee_cand_map: dict[str, str] = {}
    if cmte_csv.exists():
        import csv as csv_mod
        with open(cmte_csv, encoding="utf-8") as f:
            reader = csv_mod.DictReader(f, delimiter="|")
            for row in reader:
                cand_id = row.get("cand_id", "")
                cmte_id = row.get("cmte_id", "")
                if cand_id and cmte_id:
                    committee_cand_map[cmte_id] = cand_id

    # Build committee ID set
    cmte_ids: set[str] = set()

    # Committee IDs whose cand_id matches a legislator's fec_id
    for cmte_id, cand_id in committee_cand_map.items():
        if cand_id in leg_fec_ids:
            cmte_ids.add(cmte_id)
            pcc = all_cand_pccs.get(cand_id, "")
            if pcc:
                cmte_ids.add(pcc)

    # Candidates' PCCs for any candidate matching a legislator fec_id
    for cand_id, pcc in all_cand_pccs.items():
        if cand_id in leg_fec_ids and pcc:
            cmte_ids.add(pcc)

    log.info("Legislator committee filter: %d committee IDs", len(cmte_ids))
    return cmte_ids


# ── Per-file import functions ─────────────────────────────────────────────────

def import_candidates(cycle: int, active: bool) -> int:
    """Import candidates to local CSV only (no Supabase)."""
    zip_path = ensure_zip(cycle, "cn", active)
    if not zip_path:
        log.error("Cannot find/download cn zip for cycle %d", cycle)
        return 0

    processed_dir = DATA_RAW.parent / "processed" / "fec"
    txt_path = extract_zip(zip_path, processed_dir)
    csv_path = DATA_PROCESSED_FEC / f"candidates_{cycle}.csv"

    source_file = f"candidates_{cycle}"
    _clear_csv_if_fresh(source_file, csv_path)

    total = 0
    for chunk_index, chunk in stream_fec_file(txt_path, CN_COLS, UPSERT_BATCH):
        if checkpoint_exists(SCRIPT, source_file, chunk_index):
            continue
        rows = transform_candidates_batch(chunk, cycle)
        if rows:
            append_csv(csv_path, rows, CANDIDATES_CSV_COLS)
            total += len(rows)
        mark_checkpoint(SCRIPT, source_file, chunk_index, len(chunk), "success")

    log.info("Candidates cycle=%d: %d rows written to CSV", cycle, total)
    return total


def import_committees(cycle: int, active: bool) -> int:
    """Import committees to local CSV only (no Supabase)."""
    zip_path = ensure_zip(cycle, "cm", active)
    if not zip_path:
        log.error("Cannot find/download cm zip for cycle %d", cycle)
        return 0

    processed_dir = DATA_RAW.parent / "processed" / "fec"
    txt_path = extract_zip(zip_path, processed_dir)
    csv_path = DATA_PROCESSED_FEC / "committees.csv"

    source_file = f"committees_{cycle}"
    _clear_csv_if_fresh(source_file, csv_path)

    total = 0
    for chunk_index, chunk in stream_fec_file(txt_path, CM_COLS, UPSERT_BATCH):
        if checkpoint_exists(SCRIPT, source_file, chunk_index):
            continue
        rows = transform_committees_batch(chunk)
        if rows:
            append_csv(csv_path, rows, COMMITTEES_CSV_COLS)
            total += len(rows)
        mark_checkpoint(SCRIPT, source_file, chunk_index, len(chunk), "success")

    log.info("Committees cycle=%d: %d rows written to CSV", cycle, total)
    return total


def import_candidate_summaries(cycle: int, active: bool) -> int:
    """Import candidate financial summaries (webl) to local CSV only."""
    zip_path = ensure_zip(cycle, "webl", active)
    if not zip_path:
        log.error("Cannot find/download webl zip for cycle %d", cycle)
        return 0

    processed_dir = DATA_RAW.parent / "processed" / "fec"
    txt_path = extract_zip(zip_path, processed_dir)
    csv_path = DATA_PROCESSED_FEC / f"candidate_summaries_{cycle}.csv"

    source_file = f"candidate_summaries_{cycle}"
    _clear_csv_if_fresh(source_file, csv_path)

    total = 0
    for chunk_index, chunk in stream_fec_file(txt_path, WEBL_COLS, UPSERT_BATCH):
        if checkpoint_exists(SCRIPT, source_file, chunk_index):
            continue
        rows = transform_candidate_summaries_batch(chunk, cycle)
        if rows:
            append_csv(csv_path, rows, CAND_SUMMARY_CSV_COLS)
            total += len(rows)
        mark_checkpoint(SCRIPT, source_file, chunk_index, len(chunk), "success")

    log.info("Candidate summaries cycle=%d: %d rows written to CSV", cycle, total)
    return total


def load_ccl_map(cycle: int, active: bool) -> dict[str, str]:
    """Load CCL file into memory as cand_id → cmte_id dict."""
    zip_path = ensure_zip(cycle, "ccl", active)
    if not zip_path:
        log.warning("CCL zip not found for cycle %d", cycle)
        return {}

    processed_dir = DATA_RAW.parent / "processed" / "fec"
    txt_path = extract_zip(zip_path, processed_dir)

    records = list(stream_fec_file_rows(txt_path, CCL_COLS))
    from transform.candidate_committee_linkages import build_cand_to_cmte
    return build_cand_to_cmte(records)


def import_pas2(cycle: int, active: bool) -> tuple[int, int]:
    """Import pac_to_candidate and independent_expenditures from pas2 file.
    Writes to both Supabase and local CSVs."""
    zip_path = ensure_zip(cycle, "pas2", active)
    if not zip_path:
        log.error("Cannot find/download pas2 zip for cycle %d", cycle)
        return 0, 0

    processed_dir = DATA_RAW.parent / "processed" / "fec"
    txt_path = extract_zip(zip_path, processed_dir)

    pac_csv = DATA_PROCESSED_FEC / f"pac_to_candidate_{cycle}.csv"
    ie_csv = DATA_PROCESSED_FEC / f"independent_expenditures_{cycle}.csv"

    pac_key = f"pac_to_cand_{cycle}"
    ie_key = f"ind_exp_{cycle}"
    _clear_csv_if_fresh(pac_key, pac_csv)
    _clear_csv_if_fresh(ie_key, ie_csv)

    pac_total = 0
    ie_total = 0

    for chunk_index, chunk in stream_fec_file(txt_path, PAS2_COLS, CHUNK_SIZE):
        pac_done = checkpoint_exists(SCRIPT, pac_key, chunk_index)
        ie_done = checkpoint_exists(SCRIPT, ie_key, chunk_index)

        if not pac_done:
            pac_rows = transform_pac_contributions_batch(chunk, cycle)
            if pac_rows:
                append_csv(pac_csv, pac_rows, PAC_CSV_COLS)
                for b in batch(pac_rows, UPSERT_BATCH):
                    upsert("pac_to_candidate", b)
                pac_total += len(pac_rows)
            mark_checkpoint(SCRIPT, pac_key, chunk_index, len(chunk), "success")

        if not ie_done:
            ie_rows = transform_independent_expenditures_batch(chunk, cycle)
            if ie_rows:
                append_csv(ie_csv, ie_rows, IE_CSV_COLS)
                for b in batch(ie_rows, UPSERT_BATCH):
                    upsert("independent_expenditures", b)
                ie_total += len(ie_rows)
            mark_checkpoint(SCRIPT, ie_key, chunk_index, len(chunk), "success")

        if chunk_index % 10 == 0:
            log.info("  pas2 chunk %d: %d pac, %d ie so far", chunk_index, pac_total, ie_total)

    log.info("PAC cycle=%d: %d pac rows, %d ie rows", cycle, pac_total, ie_total)
    return pac_total, ie_total


def import_individual_contributions(cycle: int, active: bool, valid_cmte_ids: set[str]) -> int:
    """Stream indiv file, filter to tracked legislators' committees, write to local CSV only."""
    zip_path = ensure_zip(cycle, "indiv", active)
    if not zip_path:
        log.error("Cannot find/download indiv zip for cycle %d", cycle)
        return 0

    log.info("Extracting indiv zip (this may take a while — file is ~4GB)…")
    processed_dir = DATA_RAW.parent / "processed" / "fec"
    txt_path = extract_zip(zip_path, processed_dir)

    csv_path = DATA_PROCESSED_FEC / f"individual_contributions_{cycle}.csv"
    source_file = f"indiv_{cycle}"
    _clear_csv_if_fresh(source_file, csv_path)

    total = 0

    for chunk_index, chunk in stream_fec_file(txt_path, INDIV_COLS, CHUNK_SIZE):
        if checkpoint_exists(SCRIPT, source_file, chunk_index):
            continue

        mark_checkpoint(SCRIPT, source_file, chunk_index, len(chunk), "pending")
        try:
            rows = transform_individuals_batch(chunk, cycle, valid_cmte_ids)
            if rows:
                append_csv(csv_path, rows, INDIV_CSV_COLS)
                total += len(rows)
            mark_checkpoint(SCRIPT, source_file, chunk_index, len(chunk), "success")
        except Exception as e:
            mark_checkpoint(SCRIPT, source_file, chunk_index, len(chunk), "failed", str(e))
            log.error("Chunk %d failed: %s", chunk_index, e)
            raise

        if chunk_index % 20 == 0:
            log.info("  indiv chunk %d: %d rows written so far", chunk_index, total)

    log.info("Individual contributions cycle=%d: %d rows written to CSV", cycle, total)
    return total


# ── Main ──────────────────────────────────────────────────────────────────────

def run(cycles: list[int]) -> None:
    run_id = log_run_start(SCRIPT)
    results: dict = {}

    try:
        for cycle in cycles:
            active = is_active_cycle(cycle)
            log.info("=== FEC cycle %d (active=%s) ===", cycle, active)

            # 1. Candidates → local CSV only
            results[f"candidates_{cycle}"] = import_candidates(cycle, active)

            # 2. Committees → local CSV only
            results[f"committees_{cycle}"] = import_committees(cycle, active)

            # 3. Candidate financial summaries (webl) → local CSV only
            results[f"candidate_summaries_{cycle}"] = import_candidate_summaries(cycle, active)

            # 4. CCL (in-memory — not stored as separate table)
            ccl_map = load_ccl_map(cycle, active)
            log.info("CCL map loaded: %d entries", len(ccl_map))

            # 5. PAC contributions + independent expenditures → Supabase + CSV
            pac_n, ie_n = import_pas2(cycle, active)
            results[f"pac_to_candidate_{cycle}"] = pac_n
            results[f"independent_expenditures_{cycle}"] = ie_n

        # 6. Build legislator committee filter (from local CSVs + Supabase legislators)
        valid_cmte_ids = build_legislator_cmte_ids(cycles)

        # 7. Individual contributions → local CSV only (streaming, filtered)
        for cycle in cycles:
            active = is_active_cycle(cycle)
            results[f"individual_contributions_{cycle}"] = import_individual_contributions(
                cycle, active, valid_cmte_ids
            )

        log.info("All FEC cycles complete: %s", results)
        log_run_end(run_id, "success", results)

    except Exception as e:
        log.exception("bulk_import_fec failed")
        log_run_end(run_id, "failed", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bulk import FEC campaign finance data")
    parser.add_argument(
        "--cycles", type=int, nargs="+", default=FEC_CYCLES,
        help=f"FEC election cycles to import (default: {FEC_CYCLES})"
    )
    args = parser.parse_args()
    run(cycles=args.cycles)
