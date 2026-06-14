"""Bill endpoints: list, search, detail, by-topic."""
from typing import Literal
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.ml.embeddings import embed_query, embeddings_enabled
from app.queries.bills import hybrid_bill_search, lookup_bill, get_bills_by_topic, get_bill_votes

log = structlog.get_logger()
router = APIRouter(prefix="/api/bills", tags=["bills"])


@router.get("")
async def list_bills(
    q: str | None = None,
    status: str | None = None,
    topics: str | None = None,
    sort: Literal["newest", "oldest"] = "newest",
    congress: int | None = None,
    limit: int = Query(default=20, le=250),
    offset: int = Query(default=0, ge=0),
    response: Response = None,
    db: AsyncSession = Depends(get_db),
):
    if response is not None:
        response.headers["Cache-Control"] = "public, max-age=300"
    if q:
        status_list = status.split(",") if status else None
        topic_list = topics.split(",") if topics else None
        # Semantic ranking is best-effort: if the external embedding endpoint is
        # unconfigured or fails, fall back to FTS + trigram so search still works.
        query_embedding = None
        if embeddings_enabled():
            try:
                query_embedding = await embed_query(q)
            except Exception as exc:
                log.warning("query_embedding_failed", error=str(exc))
        results, total = await hybrid_bill_search(
            db, q, query_embedding=query_embedding,
            status=status_list, topics=topic_list, congress=congress, limit=limit, offset=offset,
        )
        bills = [_format_bill_summary(r) for r in results]
        return {"bills": bills, "pagination": {"total": total, "limit": limit, "offset": offset}}

    _BILLS_SQL = {
        "newest": text("""
            SELECT *, COUNT(*) OVER() AS total_count
            FROM congress.bills
            WHERE (CAST(:statuses AS text[]) IS NULL OR status = ANY(CAST(:statuses AS text[])))
              AND (CAST(:topics AS text[]) IS NULL OR topics && CAST(:topics AS text[]))
              AND (CAST(:congress AS int) IS NULL OR congress = CAST(:congress AS int))
            ORDER BY introduced_date DESC NULLS LAST
            LIMIT :limit OFFSET :offset
        """),
        "oldest": text("""
            SELECT *, COUNT(*) OVER() AS total_count
            FROM congress.bills
            WHERE (CAST(:statuses AS text[]) IS NULL OR status = ANY(CAST(:statuses AS text[])))
              AND (CAST(:topics AS text[]) IS NULL OR topics && CAST(:topics AS text[]))
              AND (CAST(:congress AS int) IS NULL OR congress = CAST(:congress AS int))
            ORDER BY introduced_date ASC NULLS LAST
            LIMIT :limit OFFSET :offset
        """),
    }
    params: dict = {
        "limit": limit,
        "offset": offset,
        "statuses": status.split(",") if status else None,
        "topics": topics.split(",") if topics else None,
        "congress": congress,
    }
    result = await db.execute(_BILLS_SQL[sort], params)
    rows = result.mappings().all()
    total = rows[0]["total_count"] if rows else 0
    bills = [_format_bill_summary(dict(r)) for r in rows]
    return {"bills": bills, "pagination": {"total": total, "limit": limit, "offset": offset}}


@router.get("/by-topic")
async def bills_by_topic(
    slug: str = Query(...),
    status: str | None = None,
    limit: int = Query(default=20, le=100),
    db: AsyncSession = Depends(get_db),
):
    results = await get_bills_by_topic(db, slug, status=status, limit=limit)
    bills = [_format_bill_summary(r) for r in results]
    return {"slug": slug, "bills": bills, "count": len(bills)}


@router.get("/{bill_id}")
async def bill_detail(bill_id: str, db: AsyncSession = Depends(get_db)):
    bill = await lookup_bill(db, bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    votes = await get_bill_votes(db, bill["bill_id"])

    cosponsor_result = await db.execute(
        text("""SELECT bc.bioguide_id, bc.sponsored_at, bc.withdrawn_at, bc.original_cosponsor,
                       l.full_name, l.party, l.state, l.photo_url
                FROM congress.bill_cosponsors bc
                LEFT JOIN congress.legislators l ON l.bioguide_id = bc.bioguide_id
                WHERE bc.bill_id = :bill_id
                ORDER BY bc.sponsored_at"""),
        {"bill_id": bill["bill_id"]},
    )
    cosponsors = [
        {
            "bioguideId": r["bioguide_id"],
            "name": r.get("full_name"),
            "party": r.get("party"),
            "state": r.get("state"),
            "photoUrl": r.get("photo_url"),
            "sponsoredAt": str(r.get("sponsored_at") or ""),
            "originalCosponsor": r.get("original_cosponsor", False),
        }
        for r in cosponsor_result.mappings().all()
    ]

    actions_result = await db.execute(
        text("""SELECT acted_at, text, action_code, action_type
                FROM congress.bill_actions
                WHERE bill_id = :bill_id
                ORDER BY acted_at"""),
        {"bill_id": bill["bill_id"]},
    )
    actions = [
        {
            "date": str(r["acted_at"]),
            "text": r["text"],
            "type": r.get("action_type"),
        }
        for r in actions_result.mappings().all()
    ]

    return {
        "bill": {
            "id": bill["bill_id"],
            "number": bill.get("bill_number"),
            "title": bill["title"],
            "congress": bill["congress"],
            "introducedDate": str(bill.get("introduced_date") or ""),
            "status": bill.get("status"),
            "summary": bill.get("summary"),
            "sponsor": {
                "name": bill.get("sponsor_name"),
                "bioguideId": bill.get("sponsor_bioguide_id"),
                "party": bill.get("sponsor_party"),
            } if bill.get("sponsor_bioguide_id") else None,
            "cosponsors": cosponsors,
            "policyArea": bill.get("policy_area"),
            "topics": bill.get("topics", []),
            "congressGovUrl": bill.get("congress_gov_url"),
            "actions": actions,
            "lastActionText": bill.get("last_action_text"),
            "lastActionDate": str(bill.get("last_action_date") or ""),
            "votes": [_format_vote(v) for v in votes],
        }
    }


def _format_bill_summary(row: dict) -> dict:
    last_action = row.get("last_action_date")
    return {
        "id": row["bill_id"],
        "number": row.get("bill_number"),
        "title": row["title"],
        "sponsor": row.get("sponsor_name"),
        "party": row.get("sponsor_party"),
        "status": row.get("status"),
        "topics": row.get("topics", []),
        "lastAction": str(last_action) if last_action else None,
        "summary": (row.get("summary") or row.get("last_action_text") or "")[:400],
    }


def _format_vote(row: dict) -> dict:
    return {
        "id": row["id"],
        "date": str(row.get("date") or ""),
        "chamber": row["chamber"],
        "question": row.get("question"),
        "result": row["result"],
        "yeas": row.get("yea_total", 0),
        "nays": row.get("nay_total", 0),
        "present": row.get("present_total", 0),
        "notVoting": row.get("not_voting_total", 0),
        "partyBreakdown": {
            "democrat": {"yea": row.get("yea_democrat", 0) or 0, "nay": row.get("nay_democrat", 0) or 0},
            "republican": {"yea": row.get("yea_republican", 0) or 0, "nay": row.get("nay_republican", 0) or 0},
            "independent": {"yea": row.get("yea_independent", 0) or 0, "nay": row.get("nay_independent", 0) or 0},
        },
        "memberPositions": row.get("member_positions", []),
        "sourceUrl": row.get("source_url"),
    }
