"""Donor endpoints: PAC leaderboard + detail — live queries with in-memory cache."""
import asyncio

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from cachetools import TTLCache

from app.deps import get_db, get_optional_user
from app.config import settings
from app.queries.donors import pac_leaderboard, pac_detail

log = structlog.get_logger()

router = APIRouter(prefix="/api/donors", tags=["donors"])

_AI_SUMMARY_MODEL = "claude-haiku-4-5-20251001"

# Cache leaderboard results for 10 minutes (key = (q, limit, offset))
_leaderboard_cache: TTLCache = TTLCache(maxsize=100, ttl=600)

# In-memory cache for AI summaries — 30-day TTL, avoid repeated DB reads
_summary_cache: TTLCache = TTLCache(maxsize=500, ttl=60 * 60 * 24 * 30)

# Per-cmte_id locks to prevent duplicate Anthropic API calls for the same PAC
_summary_locks: dict[str, asyncio.Lock] = {}

# Lazy-initialized Anthropic client singleton
_anthropic_client = None


def _get_anthropic_client():
    global _anthropic_client
    if _anthropic_client is None:
        import anthropic
        _anthropic_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _anthropic_client


@router.get("")
async def list_donors(
    q: str | None = None,
    cycle: int | None = None,
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    cache_key = (q or "", cycle, limit, offset)
    if cache_key in _leaderboard_cache:
        return _leaderboard_cache[cache_key]

    rows, total = await pac_leaderboard(db, q=q, cycle=cycle, limit=limit, offset=offset)
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


@router.get("/{cmte_id}/money-flow")
async def money_flow(cmte_id: str, db: AsyncSession = Depends(get_db)):
    """Money flow visualization: top individual funders + top recipients."""
    # Get PAC name
    name_row = await db.execute(
        text("SELECT cmte_name FROM fec.cmte_names WHERE cmte_id = :id"),
        {"id": cmte_id},
    )
    cmte_name = name_row.scalar_one_or_none()
    if not cmte_name:
        raise HTTPException(status_code=404, detail="Committee not found")

    # Top individual funders from pre-computed table
    funder_rows = await db.execute(
        text("""
            SELECT canonical_donor_id, display_name, employer, state,
                   total_amount, contribution_count, confidence, rank
            FROM derived.pac_top_funders
            WHERE cmte_id = :id
            ORDER BY rank
            LIMIT 10
        """),
        {"id": cmte_id},
    )
    funders = [
        {
            "canonicalDonorId": r["canonical_donor_id"],
            "name": r["display_name"],
            "employer": r["employer"],
            "state": r["state"],
            "totalAmount": float(r["total_amount"]),
            "contributionCount": r["contribution_count"],
            "confidence": float(r["confidence"]),
            "type": "individual",
        }
        for r in funder_rows.mappings().all()
    ]

    # Fallback: if no individual funders, show top PAC sources from money flow
    funder_type = "individual"
    if not funders:
        funder_type = "pac"
        pac_source_rows = await db.execute(
            text("""
                SELECT mfa.origin_entity_id, cn.cmte_name as name,
                       SUM(mfa.attributed_amount) as total_amount,
                       COUNT(*) as flow_count
                FROM analytics.money_flow_attribution mfa
                LEFT JOIN fec.cmte_names cn ON cn.cmte_id = mfa.origin_entity_id
                WHERE mfa.destination_committee_id = :id AND mfa.hop_count = 1
                GROUP BY mfa.origin_entity_id, cn.cmte_name
                ORDER BY total_amount DESC
                LIMIT 10
            """),
            {"id": cmte_id},
        )
        funders = [
            {
                "entityId": r["origin_entity_id"],
                "name": r["name"] or r["origin_entity_id"],
                "employer": None,
                "state": None,
                "totalAmount": float(r["total_amount"]),
                "contributionCount": 0,
                "confidence": 0,
                "type": "pac",
            }
            for r in pac_source_rows.mappings().all()
        ]

    # Top recipients: combine direct contributions + IE (with support/oppose)
    # from FEC source tables — more accurate than money_flow_attribution for this view
    recipient_rows = await db.execute(
        text("""
            WITH fec_direct AS (
                SELECT cand_id, SUM(transaction_amt) as direct, 0::numeric as ie_for, 0::numeric as ie_against
                FROM fec.pac_to_candidate
                WHERE cmte_id = :id
                GROUP BY cand_id
            ),
            fec_ie AS (
                SELECT cand_id,
                       0::numeric as direct,
                       SUM(CASE WHEN sup_opp = 'S' THEN transaction_amt ELSE 0 END) as ie_for,
                       SUM(CASE WHEN sup_opp = 'O' THEN transaction_amt ELSE 0 END) as ie_against
                FROM fec.independent_expenditures
                WHERE cmte_id = :id
                GROUP BY cand_id
            ),
            combined AS (
                SELECT cand_id, SUM(direct) as direct, SUM(ie_for) as ie_for, SUM(ie_against) as ie_against,
                       SUM(direct) + SUM(ie_for) + SUM(ie_against) as total
                FROM (SELECT * FROM fec_direct UNION ALL SELECT * FROM fec_ie) sub
                GROUP BY cand_id
                HAVING SUM(direct) + SUM(ie_for) + SUM(ie_against) > 0
            )
            SELECT c.cand_id as entity_id,
                   COALESCE(l.full_name, fc.cand_name, c.cand_id) as name,
                   COALESCE(l.party, fc.cand_party) as party,
                   COALESCE(l.state, fc.cand_state) as state,
                   l.chamber,
                   l.bioguide_id,
                   fc.cand_office,
                   c.direct, c.ie_for, c.ie_against, c.total as amount
            FROM combined c
            LEFT JOIN congress.legislators l ON c.cand_id = ANY(l.fec_ids)
            LEFT JOIN fec.candidates fc ON fc.cand_id = c.cand_id
            ORDER BY c.total DESC
            LIMIT 10
        """),
        {"id": cmte_id},
    )
    recipients = [
        {
            "entityId": r["entity_id"],
            "name": r["name"],
            "party": r["party"],
            "state": r["state"],
            "chamber": r["chamber"],
            "bioguideId": r["bioguide_id"],
            "candOffice": r.get("cand_office"),
            "amount": float(r["amount"]),
            "direct": float(r["direct"]),
            "ieFor": float(r["ie_for"]),
            "ieAgainst": float(r["ie_against"]),
        }
        for r in recipient_rows.mappings().all()
    ]

    # Flow stats
    stats_row = await db.execute(
        text("""
            SELECT
                (SELECT COALESCE(SUM(attributed_amount), 0)
                 FROM analytics.money_flow_attribution
                 WHERE destination_committee_id = :id AND hop_count = 1) as total_inbound,
                (SELECT COALESCE(SUM(attributed_amount), 0)
                 FROM analytics.money_flow_attribution
                 WHERE origin_entity_id = :id AND hop_count = 1) as total_outbound,
                (SELECT COUNT(DISTINCT origin_entity_id)
                 FROM analytics.money_flow_attribution
                 WHERE destination_committee_id = :id AND hop_count = 1) as funder_count,
                (SELECT COUNT(DISTINCT destination_committee_id)
                 FROM analytics.money_flow_attribution
                 WHERE origin_entity_id = :id AND hop_count = 1) as recipient_count
        """),
        {"id": cmte_id},
    )
    stats = stats_row.mappings().first()

    return {
        "cmteId": cmte_id,
        "cmteName": cmte_name,
        "funderType": funder_type,
        "topFunders": funders,
        "topRecipients": recipients,
        "flowStats": {
            "totalInbound": float(stats["total_inbound"]) if stats else 0,
            "totalOutbound": float(stats["total_outbound"]) if stats else 0,
            "funderCount": int(stats["funder_count"]) if stats else 0,
            "recipientCount": int(stats["recipient_count"]) if stats else 0,
        },
    }


@router.get("/{cmte_id}")
async def donor_detail(cmte_id: str, cycle: int | None = None, db: AsyncSession = Depends(get_db)):
    result = await pac_detail(db, cmte_id, cycle=cycle)
    if not result:
        raise HTTPException(status_code=404, detail="Committee not found")

    # Attach cached AI summary if available (don't block on generation)
    summary = await _get_cached_summary(db, cmte_id)
    result["summary"] = summary
    return result


@router.post("/{cmte_id}/summary")
async def generate_pac_summary(
    cmte_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(get_optional_user),
):
    """Generate AI summary for a PAC on demand. Returns cached version if available."""
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    # Check cache first (before acquiring lock)
    cached = await _get_cached_summary(db, cmte_id)
    if cached:
        return {"summary": cached}

    # Acquire per-PAC lock to prevent duplicate Anthropic calls
    if cmte_id not in _summary_locks:
        _summary_locks[cmte_id] = asyncio.Lock()
    async with _summary_locks[cmte_id]:
        # Re-check cache after acquiring lock (another request may have populated it)
        cached = await _get_cached_summary(db, cmte_id)
        if cached:
            return {"summary": cached}

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
        message = await _get_anthropic_client().messages.create(
            model=_AI_SUMMARY_MODEL,
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text
    except Exception as e:
        log.error("pac_summary_generation_failed", cmte_id=pac_data.get("cmteId"), error=str(e))
        return None
