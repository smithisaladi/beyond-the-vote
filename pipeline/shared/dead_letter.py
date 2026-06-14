"""Dead-letter queue — stores failed pipeline rows for later retry."""
from __future__ import annotations

import json

import structlog

from shared.db import get_conn

log = structlog.get_logger()


def record_dead_letter(
    *,
    run_id: str | None,
    source_table: str,
    source_key: dict,
    raw_data: dict,
    error: str,
) -> None:
    """Insert a failed row into ops.dead_letter."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO ops.dead_letter
            (run_id, source_table, source_key, raw_data, error)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (run_id, source_table, json.dumps(source_key), json.dumps(raw_data), error),
    )
    log.warning(
        "dead_letter_recorded",
        source_table=source_table,
        source_key=source_key,
        error=error,
    )


def get_unresolved_count() -> int:
    """Return the number of unresolved dead-letter rows."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM ops.dead_letter WHERE NOT resolved")
    row = cur.fetchone()
    return row[0] if row else 0


def fetch_unresolved(limit: int = 100) -> list[dict]:
    """Return up to `limit` unresolved dead-letter rows, oldest first."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, run_id, source_table, source_key, raw_data, error,
               created_at, retried_at, resolved
        FROM ops.dead_letter
        WHERE NOT resolved
        ORDER BY created_at ASC
        LIMIT %s
        """,
        (limit,),
    )
    rows = cur.fetchall()
    return [
        {
            "id": r[0],
            "run_id": r[1],
            "source_table": r[2],
            "source_key": r[3],
            "raw_data": r[4],
            "error": r[5],
            "created_at": r[6],
            "retried_at": r[7],
            "resolved": r[8],
        }
        for r in rows
    ]


def mark_resolved(dead_letter_id: str) -> None:
    """Mark a dead-letter row as resolved."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE ops.dead_letter
        SET resolved = TRUE, retried_at = now()
        WHERE id = %s
        """,
        (dead_letter_id,),
    )
    log.info("dead_letter_resolved", id=dead_letter_id)
