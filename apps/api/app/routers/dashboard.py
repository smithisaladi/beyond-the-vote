# apps/api/app/routers/dashboard.py
"""Dashboard endpoints — all require authentication."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.deps import get_db, get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("/followed")
async def get_followed(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    user_id = str(user["user_id"])
    sql = """SELECT l.bioguide_id, l.full_name, l.title, l.party, l.state, l.state_full, l.district, l.photo_url
    FROM app.followed_politicians fp JOIN congress.legislators l ON l.bioguide_id = fp.politician_id
    WHERE fp.user_id = :user_id ORDER BY l.full_name"""
    result = await db.execute(text(sql), {"user_id": user_id})
    legislators = result.mappings().all()
    politicians = []
    for r in legislators:
        vote_sql = """SELECT vs.bill_id, vs.question, vs.date, vp.position, b.title as bill_title
        FROM congress.bill_vote_positions vp JOIN congress.bill_vote_summaries vs ON vs.id = vp.vote_id
        LEFT JOIN congress.bills b ON b.bill_id = vs.bill_id WHERE vp.bioguide_id = :bio_id
        ORDER BY vs.date DESC LIMIT 1"""
        vote_result = await db.execute(text(vote_sql), {"bio_id": r["bioguide_id"]})
        latest_vote = vote_result.mappings().first()
        district_str = f"{r['district']}th District" if r.get("district") else None
        entry = {"id": r["bioguide_id"], "name": r["full_name"], "title": f"U.S. {r['title']}",
                 "party": r["party"], "state": r["state_full"], "photo": r.get("photo_url"),
                 "district": district_str, "latestVote": None}
        if latest_vote:
            entry["latestVote"] = {"billId": latest_vote.get("bill_id"), "billTitle": latest_vote.get("bill_title"),
                                   "date": str(latest_vote["date"]), "vote": latest_vote["position"],
                                   "question": latest_vote.get("question")}
        politicians.append(entry)
    return {"politicians": politicians}

@router.get("/tracked-bills")
async def get_tracked_bills(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    user_id = str(user["user_id"])
    sql = """SELECT b.bill_id, b.bill_number, b.title, b.status, b.last_action_date, b.last_action_text, b.policy_area
    FROM app.tracked_bills tb JOIN congress.bills b ON b.bill_id = tb.bill_id
    WHERE tb.user_id = :user_id ORDER BY b.last_action_date DESC NULLS LAST"""
    result = await db.execute(text(sql), {"user_id": user_id})
    rows = result.mappings().all()
    bills = [{"id": r["bill_id"], "number": r.get("bill_number"), "title": r["title"], "status": r.get("status"),
              "lastAction": str(r["last_action_date"]) if r.get("last_action_date") else None,
              "lastActionText": r.get("last_action_text"), "category": r.get("policy_area") or ""} for r in rows]
    return {"bills": bills}

@router.get("/topic-preferences")
async def get_topic_preferences(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    user_id = str(user["user_id"])
    result = await db.execute(text("SELECT topic FROM app.topic_preferences WHERE user_id = :user_id"), {"user_id": user_id})
    topics = [r["topic"] for r in result.mappings().all()]
    return {"topics": topics}
