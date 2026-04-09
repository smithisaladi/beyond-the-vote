"""
sync_legislators.py — Daily refresh of current legislators.

Downloads the latest congress-legislators YAML, transforms, and upserts
to the legislators + committee_memberships tables.

Usage:
    python -m scripts.sync.sync_legislators
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2]))

import yaml

from config import DATA_RAW, LEGISLATORS_CURRENT_URL, UPSERT_BATCH
from load import log_run_end, log_run_start, upsert
from transform.legislators import extract_committee_memberships, transform_legislator
from utils import batch, download_file

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

SCRIPT = "sync_legislators"
RAW_DIR = DATA_RAW / "legislators"


def run() -> None:
    run_id = log_run_start(SCRIPT)
    total_legislators = 0
    total_memberships = 0

    try:
        RAW_DIR.mkdir(parents=True, exist_ok=True)

        # Always re-download for freshness
        current_path = RAW_DIR / "legislators-current.yaml"
        log.info("Downloading latest legislators-current.yaml…")
        download_file(LEGISLATORS_CURRENT_URL, current_path)

        with open(current_path, encoding="utf-8") as f:
            records = yaml.safe_load(f) or []

        log.info("Transforming %d current legislators…", len(records))
        leg_rows: list[dict] = []
        all_memberships: list[dict] = []

        for r in records:
            row = transform_legislator(r, in_office=True)
            if row:
                leg_rows.append(row)
                all_memberships.extend(extract_committee_memberships(r))

        log.info("Upserting %d legislators…", len(leg_rows))
        for chunk in batch(leg_rows, UPSERT_BATCH):
            upsert("legislators", chunk)
        total_legislators = len(leg_rows)

        log.info("Upserting %d committee memberships…", len(all_memberships))
        for chunk in batch(all_memberships, UPSERT_BATCH):
            try:
                upsert("committee_memberships", chunk)
                total_memberships += len(chunk)
            except Exception as e:
                log.warning("Membership upsert chunk failed (committee may not exist): %s", e)

        log.info("Done. Legislators: %d, Memberships: %d", total_legislators, total_memberships)
        log_run_end(run_id, "success", {
            "legislators": total_legislators,
            "memberships": total_memberships,
        })

    except Exception as e:
        log.exception("%s failed", SCRIPT)
        log_run_end(run_id, "failed", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    run()
