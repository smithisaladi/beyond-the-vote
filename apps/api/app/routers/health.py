"""Health check and data freshness endpoints."""
import time
import structlog
from cachetools import TTLCache
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.deps import get_db
from app.ml.embeddings import embeddings_enabled

log = structlog.get_logger()
router = APIRouter(tags=["health"])

_freshness_cache: TTLCache = TTLCache(maxsize=1, ttl=60)
_FRESHNESS_KEY = "freshness"


@router.get("/healthz")
async def healthz(db: AsyncSession = Depends(get_db)):
    start = time.monotonic()
    db_ok = True
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    freshness_status = "unknown"
    try:
        freshness = await _get_freshness_cached(db)
        stale_tables = [t for t in freshness if t.get("stale")]
        core_stale = [t for t in stale_tables if t["schema"] in ("congress", "fec")]
        if core_stale:
            freshness_status = "critical"
        elif stale_tables:
            freshness_status = "degraded"
        else:
            freshness_status = "healthy"
    except Exception:
        pass

    latency = round((time.monotonic() - start) * 1000, 1)
    status = "healthy" if db_ok and freshness_status != "critical" else "unhealthy"
    http_status = 503 if not db_ok else 200

    return JSONResponse(
        status_code=http_status,
        content={
            "status": status,
            "db": db_ok,
            "embedding_model": embeddings_enabled(),
            "data_freshness": freshness_status,
            "latency_ms": latency,
        },
    )


@router.get("/api/health/freshness")
async def freshness(db: AsyncSession = Depends(get_db)):
    tables = await _get_freshness_cached(db)
    stale_tables = [t for t in tables if t.get("stale")]
    core_stale = [t for t in stale_tables if t["schema"] in ("congress", "fec")]
    if core_stale:
        overall = "critical"
    elif stale_tables:
        overall = "degraded"
    else:
        overall = "healthy"
    return {"tables": tables, "overall": overall}


async def _get_freshness_cached(db: AsyncSession) -> list[dict]:
    if _FRESHNESS_KEY in _freshness_cache:
        return _freshness_cache[_FRESHNESS_KEY]
    result = await db.execute(text("""
        SELECT schema_name, table_name, last_updated, rows_affected,
               EXTRACT(EPOCH FROM (now() - last_updated)) / 86400.0 AS age_days,
               now() - last_updated > max_staleness AS is_stale
        FROM ops.data_freshness
        ORDER BY schema_name, table_name
    """))
    tables = [
        {
            "schema": r["schema_name"], "table": r["table_name"],
            "last_updated": r["last_updated"].isoformat() if r["last_updated"] else None,
            "rows_affected": r["rows_affected"],
            "age_days": round(r["age_days"], 1) if r["age_days"] else None,
            "stale": r["is_stale"],
        }
        for r in result.mappings().all()
    ]
    _freshness_cache[_FRESHNESS_KEY] = tables
    return tables
