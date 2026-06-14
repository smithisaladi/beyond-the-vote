"""Dashboard endpoints — all require authentication."""
from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.deps import get_db, get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("/followed")
async def get_followed(
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    response.headers["Cache-Control"] = "private, no-cache"
    user_id = str(user["user_id"])

    sql = """
    WITH followed AS (
        SELECT politician_id FROM app.followed_politicians WHERE user_id = :user_id
    ),
    latest_votes AS (
        SELECT DISTINCT ON (vp.bioguide_id)
            vp.bioguide_id,
            vs.bill_id, vs.question, vs.date, vp.position, b.title as bill_title
        FROM congress.bill_vote_positions vp
        JOIN congress.bill_vote_summaries vs ON vs.id = vp.vote_id
        LEFT JOIN congress.bills b ON b.bill_id = vs.bill_id
        WHERE vp.bioguide_id IN (SELECT politician_id FROM followed)
        ORDER BY vp.bioguide_id, vs.date DESC
    )
    SELECT l.bioguide_id, l.full_name, l.title, l.party, l.state, l.state_full,
           l.district, l.photo_url,
           lv.bill_id, lv.question, lv.date as vote_date, lv.position, lv.bill_title
    FROM followed f
    JOIN congress.legislators l ON l.bioguide_id = f.politician_id
    LEFT JOIN latest_votes lv ON lv.bioguide_id = l.bioguide_id
    ORDER BY l.full_name
    """
    result = await db.execute(text(sql), {"user_id": user_id})
    rows = result.mappings().all()

    politicians = []
    for r in rows:
        district_str = f"{r['district']}th District" if r.get("district") else None
        entry = {
            "id": r["bioguide_id"],
            "name": r["full_name"],
            "title": f"U.S. {r['title']}",
            "party": r["party"],
            "state": r["state_full"],
            "photo": r.get("photo_url"),
            "district": district_str,
            "latestVote": None,
        }
        if r.get("vote_date"):
            entry["latestVote"] = {
                "billId": r.get("bill_id"),
                "billTitle": r.get("bill_title"),
                "date": str(r["vote_date"]),
                "vote": r["position"],
                "question": r.get("question"),
            }
        politicians.append(entry)

    return {"politicians": politicians}

@router.post("/follow/{politician_id}")
async def follow_politician(
    politician_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    user_id = str(user["user_id"])
    await db.execute(
        text("""INSERT INTO app.followed_politicians (user_id, politician_id)
                VALUES (:user_id, :politician_id)
                ON CONFLICT DO NOTHING"""),
        {"user_id": user_id, "politician_id": politician_id},
    )
    await db.commit()
    return {"ok": True}


@router.delete("/follow/{politician_id}")
async def unfollow_politician(
    politician_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    user_id = str(user["user_id"])
    await db.execute(
        text("DELETE FROM app.followed_politicians WHERE user_id = :user_id AND politician_id = :politician_id"),
        {"user_id": user_id, "politician_id": politician_id},
    )
    await db.commit()
    return {"ok": True}


@router.post("/track/{bill_id:path}")
async def track_bill(
    bill_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    user_id = str(user["user_id"])
    await db.execute(
        text("""INSERT INTO app.tracked_bills (user_id, bill_id)
                VALUES (:user_id, :bill_id)
                ON CONFLICT DO NOTHING"""),
        {"user_id": user_id, "bill_id": bill_id},
    )
    await db.commit()
    return {"ok": True}


@router.delete("/track/{bill_id:path}")
async def untrack_bill(
    bill_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    user_id = str(user["user_id"])
    await db.execute(
        text("DELETE FROM app.tracked_bills WHERE user_id = :user_id AND bill_id = :bill_id"),
        {"user_id": user_id, "bill_id": bill_id},
    )
    await db.commit()
    return {"ok": True}


@router.get("/tracked-bills")
async def get_tracked_bills(response: Response, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    response.headers["Cache-Control"] = "private, no-cache"
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
async def get_topic_preferences(response: Response, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    response.headers["Cache-Control"] = "private, no-cache"
    user_id = str(user["user_id"])
    result = await db.execute(text("SELECT topic FROM app.topic_preferences WHERE user_id = :user_id"), {"user_id": user_id})
    topics = [r["topic"] for r in result.mappings().all()]
    return {"topics": topics}
