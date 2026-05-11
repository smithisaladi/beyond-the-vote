# pipeline/scripts/create_schema.py
"""Run the full schema SQL against Supabase Postgres.

Usage: uv run python -m pipeline.scripts.create_schema
"""
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv()


def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    schema_path = Path(__file__).parent.parent / "schema.sql"
    sql = schema_path.read_text()

    conn = psycopg2.connect(database_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        print("Schema created successfully.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
