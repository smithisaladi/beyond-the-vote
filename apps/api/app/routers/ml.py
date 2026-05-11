# apps/api/app/routers/ml.py
"""ML-powered endpoints: funding comparison + vote prediction."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db

router = APIRouter(tags=["ml"])


@router.get("/api/legislators/{bioguide_id}/funding-comparison")
async def funding_comparison(
    bioguide_id: str,
    scope: str = Query(default="party"),
    db: AsyncSession = Depends(get_db),
):
    """Compare a legislator's funding profile against peers."""
    if scope not in ("party", "state", "chamber"):
        raise HTTPException(status_code=400, detail="scope must be party, state, or chamber")

    leg_result = await db.execute(
        text("SELECT party, state, chamber FROM congress.legislators WHERE bioguide_id = :id"),
        {"id": bioguide_id},
    )
    leg = leg_result.mappings().first()
    if not leg:
        raise HTTPException(status_code=404, detail="Legislator not found")

    scope_filter = ""
    params: dict = {"bioguide_id": bioguide_id}
    if scope == "party":
        scope_filter = "AND l.party = :scope_val"
        params["scope_val"] = leg["party"]
    elif scope == "state":
        scope_filter = "AND l.state = :scope_val"
        params["scope_val"] = leg["state"]
    elif scope == "chamber":
        scope_filter = "AND l.chamber = :scope_val"
        params["scope_val"] = leg["chamber"]

    sql = f"""
    WITH peer_funding AS (
        SELECT fs.bioguide_id,
               fs.pac_direct_total, fs.large_donor_total, fs.small_donor_total,
               fs.superpac_ie_for, fs.in_state_total, fs.out_of_state_total,
               (fs.pac_direct_total + fs.large_donor_total + fs.small_donor_total) AS total_raised
        FROM derived.legislator_funding_summary fs
        JOIN congress.legislators l ON l.bioguide_id = fs.bioguide_id
        WHERE l.in_office = true {scope_filter}
        AND fs.cycle = (SELECT MAX(cycle) FROM derived.legislator_funding_summary)
    ),
    ranked AS (
        SELECT *,
               PERCENT_RANK() OVER (ORDER BY total_raised) AS total_percentile,
               PERCENT_RANK() OVER (ORDER BY pac_direct_total) AS pac_percentile,
               PERCENT_RANK() OVER (ORDER BY small_donor_total) AS small_donor_percentile
        FROM peer_funding
    )
    SELECT * FROM ranked WHERE bioguide_id = :bioguide_id
    """

    result = await db.execute(text(sql), params)
    row = result.mappings().first()

    if not row:
        return {"comparison": None, "scope": scope, "message": "No funding data available"}

    return {
        "comparison": {
            "bioguideId": bioguide_id,
            "scope": scope,
            "scopeValue": params.get("scope_val", ""),
            "totalRaised": float(row.get("total_raised") or 0),
            "totalPercentile": round(float(row.get("total_percentile") or 0) * 100, 1),
            "pacDirectTotal": float(row.get("pac_direct_total") or 0),
            "pacPercentile": round(float(row.get("pac_percentile") or 0) * 100, 1),
            "smallDonorTotal": float(row.get("small_donor_total") or 0),
            "smallDonorPercentile": round(float(row.get("small_donor_percentile") or 0) * 100, 1),
            "inStateTotal": float(row.get("in_state_total") or 0),
            "outOfStateTotal": float(row.get("out_of_state_total") or 0),
        }
    }


@router.get("/api/legislators/{bioguide_id}/vote-prediction")
async def vote_prediction(
    bioguide_id: str,
    bill_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Predict how a legislator would vote on a bill."""
    from app.ml.vote_prediction import predict_vote, is_model_available

    leg_result = await db.execute(
        text("""SELECT l.party, ms.nominate_dim1, ms.nominate_dim2
                FROM congress.legislators l
                LEFT JOIN congress.member_scores ms ON ms.bioguide_id = l.bioguide_id
                    AND ms.congress = (SELECT MAX(congress) FROM congress.member_scores WHERE bioguide_id = l.bioguide_id)
                WHERE l.bioguide_id = :id"""),
        {"id": bioguide_id},
    )
    leg = leg_result.mappings().first()
    if not leg:
        raise HTTPException(status_code=404, detail="Legislator not found")

    bill_result = await db.execute(
        text("SELECT sponsor_party, topics, policy_area, congress FROM congress.bills WHERE bill_id = :id"),
        {"id": bill_id},
    )
    bill = bill_result.mappings().first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    congress = bill["congress"]
    if not is_model_available(congress):
        raise HTTPException(status_code=404, detail=f"No prediction model for congress {congress}")

    dim1 = float(leg.get("nominate_dim1") or 0)
    dim2 = float(leg.get("nominate_dim2") or 0)
    same_party = 1.0 if leg.get("party") == bill.get("sponsor_party") else 0.0
    topics = bill.get("topics") or []
    topic_count = float(len(topics))
    policy = (bill.get("policy_area") or "").lower()
    is_health = 1.0 if "health" in policy else 0.0

    # Feature vector must match pipeline/enrich/vote_prediction.py FEATURE_NAMES:
    # ["nominate_dim1", "nominate_dim2", "same_party", "topic_count", "is_policy_health"]
    features = [dim1, dim2, same_party, topic_count, is_health]

    prediction = predict_vote(congress, features)
    if not prediction:
        raise HTTPException(status_code=500, detail="Prediction failed")

    prediction["bioguideId"] = bioguide_id
    prediction["billId"] = bill_id
    prediction["disclaimer"] = "Based on historical voting patterns. Not a guarantee of future votes."

    return {"prediction": prediction}
