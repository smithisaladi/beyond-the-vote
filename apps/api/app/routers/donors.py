"""Donor endpoints: PAC leaderboard + detail — live queries with in-memory cache."""
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from cachetools import TTLCache

from app.deps import get_db
from app.config import settings
from app.queries.donors import pac_leaderboard, pac_detail

log = structlog.get_logger()

router = APIRouter(prefix="/api/donors", tags=["donors"])

# Cache leaderboard results for 10 minutes (key = (q, limit, offset))
_leaderboard_cache: TTLCache = TTLCache(maxsize=100, ttl=600)

# In-memory cache for AI summaries — 30-day TTL, avoid repeated DB reads
_summary_cache: TTLCache = TTLCache(maxsize=500, ttl=60 * 60 * 24 * 30)


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
            "rank": r.get("global_rank", offset + i + 1),
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

    # Attach cached AI summary if available (don't block on generation)
    summary = await _get_cached_summary(db, cmte_id)
    result["summary"] = summary
    return result


@router.post("/{cmte_id}/summary")
async def generate_pac_summary(cmte_id: str, db: AsyncSession = Depends(get_db)):
    """Generate AI summary for a PAC on demand. Returns cached version if available."""
    # Check cache first
    cached = await _get_cached_summary(db, cmte_id)
    if cached:
        return {"summary": cached}

    # Need PAC data to generate summary
    result = await pac_detail(db, cmte_id)
    if not result:
        raise HTTPException(status_code=404, detail="Committee not found")

    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="AI summaries unavailable")

    summary = await _generate_summary(result)
    if summary:
        await _store_summary(db, cmte_id, summary)
    return {"summary": summary}


async def _get_cached_summary(db: AsyncSession, cmte_id: str) -> str | None:
    if cmte_id in _summary_cache:
        return _summary_cache[cmte_id]

    row = await db.execute(
        text("SELECT summary FROM derived.pac_ai_summaries WHERE cmte_id = :id"),
        {"id": cmte_id},
    )
    result = row.scalar_one_or_none()
    if result:
        _summary_cache[cmte_id] = result
    return result


async def _store_summary(db: AsyncSession, cmte_id: str, summary: str):
    await db.execute(
        text("""
            INSERT INTO derived.pac_ai_summaries (cmte_id, summary)
            VALUES (:id, :summary)
            ON CONFLICT (cmte_id) DO UPDATE SET summary = :summary, created_at = now()
        """),
        {"id": cmte_id, "summary": summary},
    )
    await db.commit()
    _summary_cache[cmte_id] = summary


async def _generate_summary(pac_data: dict) -> str | None:
    import anthropic

    recipients = pac_data.get("recipients", [])
    top_recipients = sorted(recipients, key=lambda r: r.get("amount", 0), reverse=True)[:10]

    recipient_lines = "\n".join(
        f"  - {r['name']} ({r.get('party', '?')}-{r.get('state', '?')}, {r.get('chamber', '?')}): "
        f"${r.get('amount', 0):,.0f} total (${r.get('direct', 0):,.0f} direct, ${r.get('ieFor', 0):,.0f} IE support)"
        for r in top_recipients
    )

    party_totals: dict[str, float] = {}
    for r in recipients:
        party = r.get("party", "Unknown")
        party_totals[party] = party_totals.get(party, 0) + r.get("amount", 0)
    party_lines = "\n".join(f"  - {p}: ${amt:,.0f}" for p, amt in sorted(party_totals.items(), key=lambda x: -x[1]))

    prompt = f"""Write a short plain-text summary of this PAC (2-3 sentences max). No markdown, no headers, no bold, no bullets — just plain sentences.

{pac_data['name']}{' (affiliated with ' + pac_data['connectedOrg'] + ')' if pac_data.get('connectedOrg') else ''}
Direct: ${pac_data.get('directTotal', 0):,.0f} | IE Support: ${pac_data.get('ieForTotal', 0):,.0f} | IE Against: ${pac_data.get('ieAgainstTotal', 0):,.0f}
By party: {party_lines}
Top recipients: {recipient_lines}

Cover what the PAC represents, its partisan lean, and spending pattern. Be factual, no speculation."""

    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text
    except Exception as e:
        log.error("pac_summary_generation_failed", cmte_id=pac_data.get("cmteId"), error=str(e))
        return None
