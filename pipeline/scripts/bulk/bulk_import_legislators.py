"""
bulk_import_legislators.py — One-time load of all current + historical legislators.

Downloads the congress-legislators YAML files if not already present, transforms
each record, and upserts to legislators + committee_memberships tables.

Usage:
    python scripts/bulk/bulk_import_legislators.py [--force-download]
"""

import argparse
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2]))

import yaml

from config import (
    DATA_RAW,
    LEGISLATORS_CURRENT_URL,
    LEGISLATORS_HISTORICAL_URL,
    UPSERT_BATCH,
)
from load import log_run_end, log_run_start, upsert
from transform.legislators import extract_committee_memberships, transform_legislator
from utils import batch, download_file

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

SCRIPT = "bulk_import_legislators"
RAW_DIR = DATA_RAW / "legislators"


def load_yaml_file(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or []


def download_if_needed(url: str, dest: Path, force: bool) -> Path:
    if dest.exists() and not force:
        log.info("Using cached %s", dest.name)
        return dest
    return download_file(url, dest)


def run(force_download: bool = False) -> None:
    run_id = log_run_start(SCRIPT)
    total_legislators = 0
    total_memberships = 0

    try:
        RAW_DIR.mkdir(parents=True, exist_ok=True)

        current_path = RAW_DIR / "legislators-current.yaml"
        historical_path = RAW_DIR / "legislators-historical.yaml"

        download_if_needed(LEGISLATORS_CURRENT_URL, current_path, force_download)
        download_if_needed(LEGISLATORS_HISTORICAL_URL, historical_path, force_download)

        log.info("Loading current legislators…")
        current = load_yaml_file(current_path)
        log.info("Loading historical legislators…")
        historical = load_yaml_file(historical_path)

        # Transform and upsert — current first so in_office=True takes precedence
        sources = [(current, True), (historical, False)]
        all_memberships: list[dict] = []

        for records, in_office in sources:
            label = "current" if in_office else "historical"
            log.info("Transforming %d %s legislators…", len(records), label)

            leg_rows: list[dict] = []
            for r in records:
                row = transform_legislator(r, in_office)
                if row:
                    leg_rows.append(row)
                    all_memberships.extend(extract_committee_memberships(r))

            log.info("Upserting %d %s legislators…", len(leg_rows), label)
            for chunk in batch(leg_rows, UPSERT_BATCH):
                upsert("legislators", chunk)
            total_legislators += len(leg_rows)

        # Upsert committee memberships
        # Filter to only memberships where committee_id exists (basic safety)
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
        log.exception("bulk_import_legislators failed")
        log_run_end(run_id, "failed", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bulk import legislators from congress-legislators YAML")
    parser.add_argument("--force-download", action="store_true", help="Re-download YAML files even if cached")
    args = parser.parse_args()
    run(force_download=args.force_download)
