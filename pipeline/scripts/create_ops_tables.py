"""Create ops infrastructure tables: data_freshness, dead_letter, pipeline_metrics.

Usage: uv run python -m scripts.create_ops_tables
"""
import os
import sys

import psycopg2
from dotenv import load_dotenv

load_dotenv()

SQL = """
CREATE TABLE IF NOT EXISTS ops.data_freshness (
    schema_name     TEXT NOT NULL,
    table_name      TEXT NOT NULL,
    last_updated    TIMESTAMPTZ NOT NULL,
    rows_affected   INTEGER NOT NULL DEFAULT 0,
    run_id          UUID REFERENCES ops.pipeline_runs(id),
    max_staleness   INTERVAL NOT NULL,
    PRIMARY KEY (schema_name, table_name)
);

CREATE TABLE IF NOT EXISTS ops.dead_letter (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          UUID REFERENCES ops.pipeline_runs(id),
    source_table    TEXT NOT NULL,
    source_key      JSONB NOT NULL,
    raw_data        JSONB NOT NULL,
    error           TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    retried_at      TIMESTAMPTZ,
    resolved        BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_unresolved
    ON ops.dead_letter (source_table, created_at)
    WHERE NOT resolved;

CREATE TABLE IF NOT EXISTS ops.pipeline_metrics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          UUID NOT NULL REFERENCES ops.pipeline_runs(id),
    script_name     TEXT NOT NULL,
    metric_name     TEXT NOT NULL,
    metric_value    NUMERIC NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_metrics_script
    ON ops.pipeline_metrics (script_name, recorded_at DESC);
"""


def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(database_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(SQL)
        print("Ops tables created successfully.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
