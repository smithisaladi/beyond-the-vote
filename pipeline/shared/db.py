"""Database access layer — direct Postgres via psycopg2.

Works with any Postgres provider (Neon, Supabase, local).
Requires DATABASE_URL environment variable.
"""
import json
import os
import uuid
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras
import structlog

log = structlog.get_logger()

_conn = None


def get_conn():
    """Get a shared psycopg2 connection. Auto-reconnects if closed."""
    global _conn
    if _conn is None or _conn.closed:
        _conn = psycopg2.connect(os.environ["DATABASE_URL"])
        _conn.autocommit = True
        # Register JSON adapter for dicts/lists
        psycopg2.extras.register_default_jsonb(_conn)
        log.info("db_connection_created")
    return _conn


def reset_conn() -> None:
    """Close and reset the connection."""
    global _conn
    if _conn and not _conn.closed:
        _conn.close()
    _conn = None
    log.info("db_connection_reset")




# ─── High-level helpers ───────────────────────────────────────────────────────

def upsert(
    table: str,
    rows: list[dict],
    *,
    on_conflict: str = "",
    batch_size: int = 500,
    schema: str = "public",
) -> int:
    """Batch upsert rows into a table. Returns total rows processed."""
    if not rows:
        return 0

    conn = get_conn()
    cur = conn.cursor()
    fq_table = f"{schema}.{table}"
    cols = list(rows[0].keys())
    cols_str = ", ".join(cols)
    vals_template = ", ".join([f"%({c})s" for c in cols])

    if on_conflict:
        conflict_cols = [c.strip() for c in on_conflict.split(",")]
        update_cols = [c for c in cols if c not in conflict_cols]
        update_str = ", ".join([f"{c} = EXCLUDED.{c}" for c in update_cols])
        sql = f"INSERT INTO {fq_table} ({cols_str}) VALUES ({vals_template}) ON CONFLICT ({on_conflict}) DO UPDATE SET {update_str}"
    else:
        sql = f"INSERT INTO {fq_table} ({cols_str}) VALUES ({vals_template}) ON CONFLICT DO NOTHING"

    total = 0
    for i in range(0, len(rows), batch_size):
        chunk = rows[i : i + batch_size]
        # Sanitize values — convert lists to JSON strings for array/jsonb columns
        sanitized = []
        for row in chunk:
            clean = {}
            for k, v in row.items():
                if isinstance(v, (list, dict)):
                    clean[k] = json.dumps(v) if not isinstance(v, list) or (v and not isinstance(v[0], str)) else v
                else:
                    clean[k] = v
            sanitized.append(clean)
        psycopg2.extras.execute_batch(cur, sql, sanitized)
        total += len(chunk)

    log.debug("upsert_complete", table=table, schema=schema, rows=total)
    return total


def delete_then_insert(
    table: str,
    rows: list[dict],
    match_cols: list[str],
    *,
    schema: str = "public",
) -> int:
    """Delete existing rows by match columns, then insert fresh rows."""
    if not rows:
        return 0

    conn = get_conn()
    cur = conn.cursor()
    fq_table = f"{schema}.{table}"

    # Delete matching rows
    where_parts = [f"{col} = %s" for col in match_cols]
    where_vals = [rows[0][col] for col in match_cols]
    cur.execute(f"DELETE FROM {fq_table} WHERE {' AND '.join(where_parts)}", where_vals)

    # Insert
    cols = list(rows[0].keys())
    cols_str = ", ".join(cols)
    vals_template = ", ".join([f"%({c})s" for c in cols])
    sql = f"INSERT INTO {fq_table} ({cols_str}) VALUES ({vals_template})"
    psycopg2.extras.execute_batch(cur, sql, rows)

    log.debug("delete_then_insert_complete", table=table, schema=schema, rows=len(rows))
    return len(rows)


def log_run_start(script: str) -> str:
    """Insert a pipeline run record, return the run ID."""
    run_id = str(uuid.uuid4())
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO ops.pipeline_runs (id, script_name, status) VALUES (%s, %s, %s)",
        (run_id, script, "running"),
    )
    log.info("pipeline_run_started", script=script, run_id=run_id)
    return run_id


def log_run_end(
    run_id: str,
    status: str,
    *,
    rows_processed: int = 0,
    error_detail: str | None = None,
    metadata: dict | None = None,
) -> None:
    """Update pipeline run with final status."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """UPDATE ops.pipeline_runs
           SET status = %s, finished_at = %s, rows_processed = %s,
               error_detail = %s, metadata = %s
           WHERE id = %s""",
        (status, datetime.now(timezone.utc), rows_processed,
         error_detail, json.dumps(metadata) if metadata else None, run_id),
    )
    log.info("pipeline_run_ended", run_id=run_id, status=status, rows=rows_processed)


def get_watermark(script: str) -> str | None:
    """Return the started_at timestamp of the last successful run for a script."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """SELECT started_at FROM ops.pipeline_runs
           WHERE script_name = %s AND status = 'success'
           ORDER BY started_at DESC LIMIT 1""",
        (script,),
    )
    row = cur.fetchone()
    return str(row[0]) if row else None
