"""Create derived schema tables: pac_detail_cache, pac_leaderboard, legislator_top_contributors.

Usage: uv run python -m scripts.create_derived_tables
"""
import logging
import os

import psycopg2
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

SQL = """
CREATE TABLE IF NOT EXISTS derived.pac_detail_cache (
    cmte_id         TEXT NOT NULL,
    cycle           SMALLINT,
    cmte_name       TEXT,
    connected_org   TEXT,
    cand_id         TEXT NOT NULL,
    bioguide_id     TEXT,
    full_name       TEXT,
    party           TEXT,
    state           TEXT,
    chamber         TEXT,
    direct          NUMERIC(12,2) NOT NULL DEFAULT 0,
    ie_for          NUMERIC(12,2) NOT NULL DEFAULT 0,
    ie_against      NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_support   NUMERIC(12,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (cmte_id, cand_id)
);
CREATE INDEX IF NOT EXISTS idx_pac_detail_cache_cmte ON derived.pac_detail_cache (cmte_id);

CREATE TABLE IF NOT EXISTS derived.pac_leaderboard (
    cmte_id             TEXT PRIMARY KEY,
    cmte_name           TEXT,
    direct_total        NUMERIC(14,2) NOT NULL DEFAULT 0,
    ie_for_total        NUMERIC(14,2) NOT NULL DEFAULT 0,
    ie_against_total    NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_contributions NUMERIC(14,2) NOT NULL DEFAULT 0,
    global_rank         INTEGER NOT NULL,
    cycle               SMALLINT,
    computed_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS derived.legislator_top_contributors (
    bioguide_id     TEXT NOT NULL,
    cmte_id         TEXT NOT NULL,
    org_name        TEXT,
    direct          NUMERIC(12,2) NOT NULL DEFAULT 0,
    ie_for          NUMERIC(12,2) NOT NULL DEFAULT 0,
    total           NUMERIC(12,2) NOT NULL DEFAULT 0,
    rank            INTEGER NOT NULL,
    cycle           SMALLINT,
    computed_at     TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (bioguide_id, cmte_id)
);
CREATE INDEX IF NOT EXISTS idx_leg_top_contrib_bio ON derived.legislator_top_contributors (bioguide_id);
"""


def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(database_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(SQL)
        log.info("Derived tables created successfully.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
