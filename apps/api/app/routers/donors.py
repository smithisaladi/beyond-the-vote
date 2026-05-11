# apps/api/app/routers/donors.py
"""Donor endpoints: PAC leaderboard + detail."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.deps import get_db
from app.queries.donors import pac_leaderboard, pac_detail

router = APIRouter(prefix="/api/donors", tags=["donors"])

@router.get("")
async def list_donors(q: str | None = None, limit: int = Query(default=20, le=100), offset: int = Query(default=0, ge=0), db: AsyncSession = Depends(get_db)):
    rows, total = await pac_leaderboard(db, q=q, limit=limit, offset=offset)
    contributors = [{"cmteId": r["cmte_id"], "rank": offset + i + 1, "cmteName": r["cmte_name"],
                     "directTotal": float(r.get("direct_total") or 0), "ieForTotal": float(r.get("ie_for_total") or 0),
                     "ieAgainstTotal": float(r.get("ie_against_total") or 0), "totalContributions": float(r.get("total_contributions") or 0),
                     "recipientCount": r.get("recipient_count", 0), "topRecipients": r.get("top_recipients") or []}
                    for i, r in enumerate(rows)]
    return {"contributors": contributors, "pagination": {"total": total, "limit": limit, "offset": offset}}

@router.get("/{cmte_id}")
async def donor_detail(cmte_id: str, db: AsyncSession = Depends(get_db)):
    result = await pac_detail(db, cmte_id)
    if not result:
        raise HTTPException(status_code=404, detail="Committee not found")
    return result
