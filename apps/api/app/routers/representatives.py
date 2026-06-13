# apps/api/app/routers/representatives.py
"""Representative lookup via address geocoding."""
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.deps import get_db

router = APIRouter(prefix="/api/representatives", tags=["representatives"])

@router.get("")
async def lookup_representatives(address: str = Query(..., min_length=5, max_length=500), db: AsyncSession = Depends(get_db)):
    if not settings.geocodio_api_key:
        raise HTTPException(status_code=503, detail="Geocoding not configured")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get("https://api.geocod.io/v1.7/geocode",
                                    params={"q": address, "fields": "cd", "api_key": settings.geocodio_api_key}, timeout=10)
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="Geocoding failed")
            data = resp.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Geocoding service unavailable: {e}")
    results = data.get("results", [])
    if not results:
        return {"representatives": []}
    fields = results[0].get("fields", {})
    districts = fields.get("congressional_districts", [])
    state = results[0].get("address_components", {}).get("state", "")
    if not districts or not state:
        return {"representatives": []}
    district_numbers = [d.get("district_number") for d in districts if d.get("district_number") is not None]
    sql = """SELECT l.bioguide_id, l.full_name, l.title, l.party, l.state, l.state_full,
           l.district, l.photo_url, l.chamber, l.website, l.phone, l.term_start,
           ms.nominate_dim1
    FROM congress.legislators l
    LEFT JOIN congress.member_scores ms ON ms.bioguide_id = l.bioguide_id
        AND ms.congress = (SELECT MAX(congress) FROM congress.member_scores WHERE bioguide_id = l.bioguide_id)
    WHERE l.in_office = true AND l.state = :state AND (l.chamber = 'Senate' OR l.district = ANY(:districts))
    ORDER BY l.chamber DESC, l.full_name"""
    result = await db.execute(text(sql), {"state": state, "districts": district_numbers})
    rows = result.mappings().all()
    representatives = []
    seen = set()
    for r in rows:
        if r["bioguide_id"] in seen:
            continue
        seen.add(r["bioguide_id"])
        district_str = f"{r['district']}th District" if r.get("district") else None
        since = str(r["term_start"].year) if r.get("term_start") else None
        representatives.append({"id": r["bioguide_id"], "bioguideId": r["bioguide_id"], "name": r["full_name"],
                                "title": f"U.S. {r['title']}", "party": r["party"], "state": r["state"],
                                "district": district_str, "photo": r.get("photo_url"), "since": since,
                                "website": r.get("website"), "phone": r.get("phone"),
                                "ideologyScore": float(r["nominate_dim1"]) if r.get("nominate_dim1") is not None else None})
    return {"representatives": representatives}
