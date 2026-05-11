"""Donor endpoints: PAC leaderboard + detail — live queries with in-memory cache."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from cachetools import TTLCache

from app.deps import get_db
from app.queries.donors import pac_leaderboard, pac_detail

router = APIRouter(prefix="/api/donors", tags=["donors"])

# Cache leaderboard results for 10 minutes (key = (q, limit, offset))
_leaderboard_cache: TTLCache = TTLCache(maxsize=100, ttl=600)


@router.get("")
async def list_donors(
    q: str | None = None,
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    cache_key = (q or "", limit, offset)
    if cache_key in _leaderboard_cache:
        return _leaderboard_cache[cache_key]

    rows, total = await pac_leaderboard(db, q=q, limit=limit, offset=offset)
    contributors = [
        {
            "cmteId": r["cmte_id"],
            "rank": offset + i + 1,
            "cmteName": r.get("cmte_name"),
            "directTotal": float(r.get("direct_total") or 0),
            "ieForTotal": float(r.get("ie_for_total") or 0),
            "ieAgainstTotal": float(r.get("ie_against_total") or 0),
            "totalContributions": float(r.get("total_contributions") or 0),
        }
        for i, r in enumerate(rows)
    ]
    result = {"contributors": contributors, "pagination": {"total": total, "limit": limit, "offset": offset}}
    _leaderboard_cache[cache_key] = result
    return result


@router.get("/{cmte_id}")
async def donor_detail(cmte_id: str, db: AsyncSession = Depends(get_db)):
    result = await pac_detail(db, cmte_id)
    if not result:
        raise HTTPException(status_code=404, detail="Committee not found")
    return result
