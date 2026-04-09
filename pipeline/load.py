"""
Database load helpers: upsert, checkpoint tracking, pipeline_run logging.
"""

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

from utils import get_supabase, reset_supabase

log = logging.getLogger(__name__)


# ── DB retry wrapper ──────────────────────────────────────────────────────────

_RETRYABLE = (httpx.RemoteProtocolError, httpx.ConnectError, httpx.NetworkError)
_MAX_RETRIES = 3


def _run(fn):
    """Execute a postgrest builder lambda, retrying on HTTP/2 connection errors."""
    for attempt in range(_MAX_RETRIES):
        try:
            return fn()
        except _RETRYABLE as e:
            if attempt == _MAX_RETRIES - 1:
                raise
            wait = 2 ** attempt * 2
            log.warning("DB connection error (%s). Resetting client, retrying in %ds.", e, wait)
            reset_supabase()
            time.sleep(wait)


# ── Upsert ────────────────────────────────────────────────────────────────────

def upsert(table: str, rows: list[dict], returning: str = "minimal") -> None:
    """
    Batch upsert rows into a Supabase table.
    Uses ON CONFLICT DO UPDATE semantics (all columns updated).
    """
    if not rows:
        return
    db = get_supabase()
    _run(lambda: db.table(table).upsert(rows, returning=returning).execute())
    log.debug("Upserted %d rows into %s", len(rows), table)


def delete_then_insert(table: str, rows: list[dict], match_cols: list[str]) -> None:
    """
    Delete existing rows by match_cols then insert fresh rows.
    Used for tables where upsert isn't safe (e.g., replacing full sets).
    """
    if not rows:
        return
    db = get_supabase()
    # Build filter from first row's match values
    sample = rows[0]
    q = db.table(table).delete()
    for col in match_cols:
        q = q.eq(col, sample[col])
    _run(lambda: q.execute())
    _run(lambda: db.table(table).insert(rows).execute())


# ── Pipeline run logging ──────────────────────────────────────────────────────

def log_run_start(script: str, phase: str | None = None) -> str:
    """
    Insert a pipeline_runs row with status='running'.
    Returns the run_id (UUID string) for later update.
    """
    run_id = str(uuid.uuid4())
    db = get_supabase()
    _run(lambda: db.table("pipeline_runs").insert({
        "id": run_id,
        "script": script,
        "phase": phase,
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }).execute())
    log.info("[%s] Run started (id=%s)", script, run_id)
    return run_id


def log_run_end(
    run_id: str,
    status: str,
    result: dict | None = None,
    error: str | None = None,
) -> None:
    """Update a pipeline_runs row with final status/result."""
    db = get_supabase()
    _run(lambda: db.table("pipeline_runs").update({
        "status": status,
        "result": result,
        "error": error,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", run_id).execute())
    log.info("[run_id=%s] Run ended with status=%s", run_id, status)


def get_watermark(script: str) -> str | None:
    """
    Return the started_at timestamp of the last successful run for `script`,
    or None if no successful run exists. Used as the incremental fetch boundary.
    """
    db = get_supabase()
    res = _run(lambda: (
        db.table("pipeline_runs")
        .select("started_at")
        .eq("script", script)
        .eq("status", "success")
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    ))
    if res and res.data:
        return res.data[0]["started_at"]
    return None


# ── Checkpoint tracking ───────────────────────────────────────────────────────

def checkpoint_exists(script: str, source_file: str, chunk_index: int) -> bool:
    """Return True if this chunk was already successfully processed."""
    db = get_supabase()
    res = _run(lambda: (
        db.table("bulk_import_checkpoints")
        .select("id")
        .eq("script", script)
        .eq("source_file", source_file)
        .eq("chunk_index", chunk_index)
        .eq("status", "success")
        .limit(1)
        .execute()
    ))
    return len(res.data) > 0


def get_last_checkpoint(script: str, source_file: str) -> int:
    """
    Return the highest successful chunk_index for this (script, source_file),
    or -1 if none. Used to determine where to resume.
    """
    db = get_supabase()
    res = _run(lambda: (
        db.table("bulk_import_checkpoints")
        .select("chunk_index")
        .eq("script", script)
        .eq("source_file", source_file)
        .eq("status", "success")
        .order("chunk_index", desc=True)
        .limit(1)
        .execute()
    ))
    if res.data:
        return res.data[0]["chunk_index"]
    return -1


def mark_checkpoint(
    script: str,
    source_file: str,
    chunk_index: int,
    rows_in_chunk: int,
    status: str,
    error: str | None = None,
) -> None:
    """Upsert a checkpoint record (pending → success | failed)."""
    from datetime import datetime, timezone
    db = get_supabase()
    _run(lambda: db.table("bulk_import_checkpoints").upsert({
        "script": script,
        "source_file": source_file,
        "chunk_index": chunk_index,
        "rows_in_chunk": rows_in_chunk,
        "status": status,
        "error": error,
        "finished_at": datetime.now(timezone.utc).isoformat() if status != "pending" else None,
    }, on_conflict="script,source_file,chunk_index").execute())
