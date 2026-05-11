"""Research mode endpoints — anomaly detection results.

All outputs are LEADS for investigation, not conclusions.
UI must frame these appropriately and link to source filings.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db

router = APIRouter(prefix="/api/research", tags=["research"])


@router.get("/suspicious-contributions")
async def list_suspicious_contributions(
    committee_id: str | None = None,
    min_score: float = Query(default=0.3, ge=0, le=1),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List suspicious contribution clusters.

    These are patterns that RESEMBLE known straw donor schemes.
    They are not accusations of wrongdoing.
    """
    params: dict = {"min_score": min_score, "limit": limit, "offset": offset}
    where = "score >= :min_score"
    if committee_id:
        where += " AND committee_id = :committee_id"
        params["committee_id"] = committee_id

    sql = f"""
    SELECT sce.*,
           cn.cmte_name,
           COUNT(*) OVER() AS total_count
    FROM anomalies.suspicious_contribution_events sce
    LEFT JOIN fec.cmte_names cn ON cn.cmte_id = sce.committee_id
    WHERE {where}
    ORDER BY sce.score DESC
    LIMIT :limit OFFSET :offset
    """
    result = await db.execute(text(sql), params)
    rows = result.mappings().all()
    total = rows[0]["total_count"] if rows else 0

    events = []
    for r in rows:
        events.append({
            "committeeId": r["committee_id"],
            "committeeName": r.get("cmte_name"),
            "eventDate": str(r.get("event_date") or ""),
            "donorCount": r.get("donor_count", 0),
            "totalAmount": float(r.get("total_amount") or 0),
            "score": float(r.get("score") or 0),
            "confidence": float(r.get("confidence") or 0),
            "signals": r.get("signals"),
        })

    return {
        "disclaimer": "These patterns resemble known suspicious activity. They are leads for investigation, not evidence of wrongdoing.",
        "events": events,
        "pagination": {"total": total, "limit": limit, "offset": offset},
    }


@router.get("/committee-changes")
async def list_committee_changes(
    committee_id: str | None = None,
    metric: str | None = None,
    min_magnitude: float = Query(default=0.3, ge=0),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List committees with significant behavioral changes.

    Detected via change-point analysis on monthly spending and activity time series.
    """
    params: dict = {"min_magnitude": min_magnitude, "limit": limit, "offset": offset}
    where_parts = ["magnitude >= :min_magnitude"]

    if committee_id:
        where_parts.append("ccp.committee_id = :committee_id")
        params["committee_id"] = committee_id
    if metric:
        where_parts.append("ccp.metric = :metric")
        params["metric"] = metric

    where = " AND ".join(where_parts)

    sql = f"""
    SELECT ccp.*,
           cn.cmte_name,
           COUNT(*) OVER() AS total_count
    FROM anomalies.committee_change_points ccp
    LEFT JOIN fec.cmte_names cn ON cn.cmte_id = ccp.committee_id
    WHERE {where}
    ORDER BY ccp.magnitude DESC
    LIMIT :limit OFFSET :offset
    """
    result = await db.execute(text(sql), params)
    rows = result.mappings().all()
    total = rows[0]["total_count"] if rows else 0

    changes = []
    for r in rows:
        changes.append({
            "committeeId": r["committee_id"],
            "committeeName": r.get("cmte_name"),
            "changeDate": str(r.get("change_date") or ""),
            "metric": r.get("metric"),
            "magnitude": float(r.get("magnitude") or 0),
            "direction": r.get("direction"),
            "confidence": float(r.get("confidence") or 0),
        })

    return {
        "disclaimer": "These are statistically detected behavioral shifts, not evidence of wrongdoing.",
        "changes": changes,
        "pagination": {"total": total, "limit": limit, "offset": offset},
    }
