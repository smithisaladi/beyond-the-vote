import os
from datetime import datetime, timezone
from supabase import create_client, Client
import structlog

log = structlog.get_logger()

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _client = create_client(url, key)
        log.info("supabase_client_created")
    return _client


def reset_supabase() -> None:
    global _client
    _client = None
    log.info("supabase_client_reset")


def upsert(
    table: str,
    rows: list[dict],
    *,
    on_conflict: str = "",
    batch_size: int = 500,
    schema: str = "public",
) -> int:
    if not rows:
        return 0
    client = get_supabase()
    total = 0
    for i in range(0, len(rows), batch_size):
        chunk = rows[i : i + batch_size]
        query = client.schema(schema).table(table).upsert(chunk, on_conflict=on_conflict)
        query.execute()
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
    if not rows:
        return 0
    client = get_supabase()
    query = client.schema(schema).table(table).delete()
    for col in match_cols:
        query = query.eq(col, rows[0][col])
    query.execute()
    for i in range(0, len(rows), 500):
        chunk = rows[i : i + 500]
        client.schema(schema).table(table).insert(chunk).execute()
    log.debug("delete_then_insert_complete", table=table, schema=schema, rows=len(rows))
    return len(rows)


def log_run_start(script: str) -> str:
    import uuid
    run_id = str(uuid.uuid4())
    client = get_supabase()
    client.schema("ops").table("pipeline_runs").insert(
        {"id": run_id, "script_name": script, "status": "running"}
    ).execute()
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
    client = get_supabase()
    update = {
        "status": status,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "rows_processed": rows_processed,
    }
    if error_detail:
        update["error_detail"] = error_detail
    if metadata:
        update["metadata"] = metadata
    client.schema("ops").table("pipeline_runs").update(update).eq("id", run_id).execute()
    log.info("pipeline_run_ended", run_id=run_id, status=status, rows=rows_processed)


def get_watermark(script: str) -> str | None:
    client = get_supabase()
    result = (
        client.schema("ops")
        .table("pipeline_runs")
        .select("started_at")
        .eq("script_name", script)
        .eq("status", "success")
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]["started_at"]
    return None
