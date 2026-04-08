"""
bulk_import_member_scores.py — Load DW-NOMINATE ideology scores for all congresses.

Reads HS{congress}_members.csv files from data/raw/member_scores/,
resolves icpsr_id → bioguide_id via the legislators table,
and upserts to member_scores.

Usage:
    python scripts/bulk/bulk_import_member_scores.py
    python scripts/bulk/bulk_import_member_scores.py --congress 118 119
"""

import argparse
import csv
import logging
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2]))

from config import DATA_RAW, UPSERT_BATCH
from load import log_run_end, log_run_start, upsert
from transform.member_scores import transform_member_scores
from utils import batch, get_supabase

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

SCRIPT = "bulk_import_member_scores"
SCORES_DIR = DATA_RAW / "member_scores"
RAW_DIR = DATA_RAW  # legacy location for HS*.csv files


def find_score_files(congress_filter: list[int] | None) -> list[tuple[Path, int]]:
    """Find all HS{congress}_members.csv files and return (path, congress) pairs."""
    pattern = re.compile(r"HS(\d+)_members\.csv", re.I)
    results = []

    # Check both data/raw/ and data/raw/member_scores/
    for search_dir in [RAW_DIR, SCORES_DIR]:
        for path in sorted(search_dir.glob("HS*_members.csv")):
            m = pattern.match(path.name)
            if m:
                congress = int(m.group(1))
                if congress_filter is None or congress in congress_filter:
                    results.append((path, congress))

    # Deduplicate by congress number (prefer member_scores/ subdir)
    seen: dict[int, Path] = {}
    for path, congress in results:
        if congress not in seen or "member_scores" in str(path):
            seen[congress] = path

    return [(path, congress) for congress, path in sorted(seen.items())]


def build_icpsr_map() -> dict[int, str]:
    """Fetch icpsr_id → bioguide_id mapping from Supabase legislators table."""
    log.info("Building icpsr_id → bioguide_id map from legislators table…")
    db = get_supabase()
    # Paginate — may have 10k+ historical legislators
    mapping: dict[int, str] = {}
    offset = 0
    page_size = 1000
    while True:
        res = (
            db.table("legislators")
            .select("bioguide_id,icpsr_id")
            .not_.is_("icpsr_id", "null")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        if not res.data:
            break
        for row in res.data:
            if row.get("icpsr_id"):
                mapping[row["icpsr_id"]] = row["bioguide_id"]
        if len(res.data) < page_size:
            break
        offset += page_size

    log.info("icpsr map: %d entries", len(mapping))
    return mapping


def read_csv(path: Path) -> list[dict]:
    """Read a VoteView CSV file (has headers, UTF-8 or latin-1)."""
    try:
        with open(path, encoding="utf-8") as f:
            return list(csv.DictReader(f))
    except UnicodeDecodeError:
        with open(path, encoding="latin-1") as f:
            return list(csv.DictReader(f))


def run(congress_filter: list[int] | None = None) -> None:
    run_id = log_run_start(SCRIPT)
    total = 0

    try:
        files = find_score_files(congress_filter)
        if not files:
            log.warning("No score files found in %s or %s", RAW_DIR, SCORES_DIR)
            log_run_end(run_id, "success", {"upserted": 0})
            return

        icpsr_map = build_icpsr_map()

        for path, congress in files:
            log.info("Processing %s (congress=%d)…", path.name, congress)
            raw_rows = read_csv(path)
            log.info("  Read %d rows", len(raw_rows))

            # Normalize column names to lowercase
            raw_rows = [{k.lower(): v for k, v in r.items()} for r in raw_rows]

            db_rows = transform_member_scores(raw_rows, congress, icpsr_map)
            log.info("  Transformed %d valid rows", len(db_rows))

            for chunk in batch(db_rows, UPSERT_BATCH):
                upsert("member_scores", chunk)
            total += len(db_rows)
            log.info("  Upserted %d rows for congress %d", len(db_rows), congress)

        log.info("Done. Total member_scores upserted: %d", total)
        log_run_end(run_id, "success", {"upserted": total})

    except Exception as e:
        log.exception("bulk_import_member_scores failed")
        log_run_end(run_id, "failed", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bulk import DW-NOMINATE member scores")
    parser.add_argument("--congress", type=int, nargs="+", help="Congress numbers to load (default: all found)")
    args = parser.parse_args()
    run(congress_filter=args.congress)
