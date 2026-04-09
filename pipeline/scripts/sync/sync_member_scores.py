"""
sync_member_scores.py — Daily refresh of DW-NOMINATE ideology scores for the current congress.

Downloads the latest VoteView CSV, resolves icpsr_id → bioguide_id,
and upserts to member_scores.

Usage:
    python -m scripts.sync.sync_member_scores
"""

import csv
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2]))

from config import CONGRESS_SESSIONS, DATA_RAW, UPSERT_BATCH
from load import log_run_end, log_run_start, upsert
from transform.member_scores import transform_member_scores
from utils import batch, download_file, get_supabase

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

SCRIPT = "sync_member_scores"
SCORES_DIR = DATA_RAW / "member_scores"
VOTEVIEW_URL = "https://voteview.com/static/data/out/members/HS{congress}_members.csv"


def current_congress() -> int:
    return max(c for c, _ in CONGRESS_SESSIONS)


def build_icpsr_map() -> dict[int, str]:
    """Fetch icpsr_id → bioguide_id mapping from Supabase legislators table."""
    log.info("Building icpsr_id → bioguide_id map…")
    db = get_supabase()
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


def read_csv_file(path: Path) -> list[dict]:
    """Read a VoteView CSV file (has headers, UTF-8 or latin-1)."""
    try:
        with open(path, encoding="utf-8") as f:
            return list(csv.DictReader(f))
    except UnicodeDecodeError:
        with open(path, encoding="latin-1") as f:
            return list(csv.DictReader(f))


def run() -> None:
    run_id = log_run_start(SCRIPT)

    try:
        congress = current_congress()
        SCORES_DIR.mkdir(parents=True, exist_ok=True)

        csv_path = SCORES_DIR / f"HS{congress}_members.csv"
        url = VOTEVIEW_URL.format(congress=congress)
        log.info("Downloading %s…", url)
        download_file(url, csv_path)

        raw_rows = read_csv_file(csv_path)
        log.info("Read %d rows from %s", len(raw_rows), csv_path.name)

        # Normalize column names to lowercase
        raw_rows = [{k.lower(): v for k, v in r.items()} for r in raw_rows]

        icpsr_map = build_icpsr_map()
        db_rows = transform_member_scores(raw_rows, congress, icpsr_map)
        log.info("Transformed %d valid rows", len(db_rows))

        for chunk in batch(db_rows, UPSERT_BATCH):
            upsert("member_scores", chunk)

        log.info("Done. Upserted %d member_scores for congress %d", len(db_rows), congress)
        log_run_end(run_id, "success", {"upserted": len(db_rows), "congress": congress})

    except Exception as e:
        log.exception("%s failed", SCRIPT)
        log_run_end(run_id, "failed", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    run()
