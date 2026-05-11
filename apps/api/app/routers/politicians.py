# apps/api/app/routers/politicians.py
"""Politician endpoints: search + detail."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db

router = APIRouter(prefix="/api/politicians", tags=["politicians"])

_IDEOLOGY_LIBERAL_THRESHOLD = -0.3
_IDEOLOGY_CONSERVATIVE_THRESHOLD = 0.3


@router.get("/search")
async def search_politicians(
    q: str = Query(..., min_length=2),
    db: AsyncSession = Depends(get_db),
):
    sql = """
    SELECT l.bioguide_id, l.full_name, l.title, l.party, l.state, l.state_full,
           l.district, l.photo_url, l.chamber, l.term_start,
           ms.nominate_dim1
    FROM congress.legislators l
    LEFT JOIN congress.member_scores ms
        ON ms.bioguide_id = l.bioguide_id
        AND ms.congress = (SELECT MAX(congress) FROM congress.member_scores WHERE bioguide_id = l.bioguide_id)
    WHERE l.full_name ILIKE :pattern OR l.last_name ILIKE :pattern
    ORDER BY l.in_office DESC, l.full_name
    LIMIT 10
    """
    result = await db.execute(text(sql), {"pattern": f"%{q}%"})
    rows = result.mappings().all()

    politicians = []
    seen = set()
    for r in rows:
        if r["bioguide_id"] in seen:
            continue
        seen.add(r["bioguide_id"])
        district_str = f"{r['district']}th District" if r.get("district") else None
        politicians.append({
            "id": r["bioguide_id"],
            "bioguideId": r["bioguide_id"],
            "name": r["full_name"],
            "title": f"U.S. {r['title']}",
            "party": r["party"],
            "state": r["state"],
            "district": district_str,
            "photo": r.get("photo_url"),
            "ideologyScore": float(r["nominate_dim1"]) if r.get("nominate_dim1") is not None else None,
        })

    return {"politicians": politicians}


@router.get("/{bioguide_id}")
async def politician_detail(bioguide_id: str, db: AsyncSession = Depends(get_db)):
    profile = await _get_profile(db, bioguide_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Politician not found")

    ideology = None
    committees = []
    votes = []
    funding = {}
    top_pacs = []
    top_contributors = []

    try:
        ideology = await _get_ideology(db, bioguide_id)
    except Exception:
        pass
    try:
        committees = await _get_committees(db, bioguide_id)
    except Exception:
        pass
    try:
        votes = await _get_recent_votes(db, bioguide_id)
    except Exception:
        pass
    try:
        funding = await _get_funding(db, bioguide_id)
    except Exception:
        pass
    try:
        top_pacs = await _get_top_pacs(db, bioguide_id)
    except Exception:
        pass
    try:
        top_contributors = await _get_top_contributors(db, bioguide_id)
    except Exception:
        pass

    district_str = f"{profile['district']}th District" if profile.get("district") else None
    years_in_office = None
    if profile.get("term_start"):
        from datetime import date
        years_in_office = (date.today() - profile["term_start"]).days // 365

    ideology_score = float(ideology["nominate_dim1"]) if ideology and ideology.get("nominate_dim1") is not None else None
    ideology_label = _ideology_label(ideology_score) if ideology_score is not None else None

    return {
        "politician": {
            "id": profile["bioguide_id"],
            "bioguideId": profile["bioguide_id"],
            "name": profile["full_name"],
            "title": f"U.S. {profile['title']}",
            "party": profile["party"],
            "state": profile["state_full"],
            "stateCode": profile["state"],
            "district": district_str,
            "since": str(profile["term_start"].year) if profile.get("term_start") else None,
            "photo": profile.get("photo_url"),
            "website": profile.get("website"),
            "address": profile.get("address"),
            "phone": profile.get("phone"),
            "twitter": profile.get("twitter"),
            "nextElectionYear": profile.get("next_election"),
            "stats": {
                "yearsInOffice": years_in_office,
                "ideologyScore": ideology_score,
                "ideologyLabel": ideology_label,
            },
            "votes": votes,
            "committees": committees,
            "pacDonors": top_pacs,
            "topContributors": top_contributors,
            "fundingBreakdown": funding,
        }
    }


async def _get_profile(db: AsyncSession, bioguide_id: str) -> dict | None:
    result = await db.execute(
        text("SELECT * FROM congress.legislators WHERE bioguide_id = :id"), {"id": bioguide_id})
    row = result.mappings().first()
    return dict(row) if row else None


async def _get_ideology(db: AsyncSession, bioguide_id: str) -> dict | None:
    result = await db.execute(
        text("SELECT * FROM congress.member_scores WHERE bioguide_id = :id ORDER BY congress DESC LIMIT 1"),
        {"id": bioguide_id})
    row = result.mappings().first()
    return dict(row) if row else None


async def _get_committees(db: AsyncSession, bioguide_id: str) -> list[dict]:
    result = await db.execute(
        text("""SELECT c.name, c.url, c.chamber, cm.role
                FROM congress.committee_memberships cm
                JOIN congress.committees c ON c.thomas_id = cm.committee_id
                WHERE cm.bioguide_id = :id"""), {"id": bioguide_id})
    return [{"name": r["name"], "url": r.get("url"), "chamber": r.get("chamber"), "title": r.get("role")}
            for r in result.mappings().all()]


async def _get_recent_votes(db: AsyncSession, bioguide_id: str) -> list[dict]:
    result = await db.execute(
        text("""SELECT vs.id, vs.date, vs.chamber, vs.question, vs.result,
                       vs.yea_total, vs.nay_total, vs.bill_id, vp.position,
                       b.title as bill_title
                FROM congress.bill_vote_positions vp
                JOIN congress.bill_vote_summaries vs ON vs.id = vp.vote_id
                LEFT JOIN congress.bills b ON b.bill_id = vs.bill_id
                WHERE vp.bioguide_id = :id
                ORDER BY vs.date DESC LIMIT 50"""), {"id": bioguide_id})
    return [{"date": str(r["date"]), "chamber": r["chamber"], "question": r.get("question"),
             "result": r["result"], "position": r["position"], "billId": r.get("bill_id"),
             "billTitle": r.get("bill_title")} for r in result.mappings().all()]


async def _get_funding(db: AsyncSession, bioguide_id: str) -> dict:
    """Compute funding summary live from FEC tables."""
    result = await db.execute(
        text("""
        WITH fec_ids AS (
            SELECT unnest(fec_ids) as cand_id FROM congress.legislators WHERE bioguide_id = :id
        ),
        pac_direct AS (
            SELECT COALESCE(SUM(transaction_amt), 0) as total
            FROM fec.pac_to_candidate
            WHERE cand_id IN (SELECT cand_id FROM fec_ids)
        ),
        ie AS (
            SELECT
                COALESCE(SUM(CASE WHEN sup_opp = 'S' THEN transaction_amt ELSE 0 END), 0) as ie_for,
                COALESCE(SUM(CASE WHEN sup_opp = 'O' THEN transaction_amt ELSE 0 END), 0) as ie_against
            FROM fec.independent_expenditures
            WHERE cand_id IN (SELECT cand_id FROM fec_ids)
        )
        SELECT pd.total as pac_direct_total, ie.ie_for as superpac_ie_for, ie.ie_against as superpac_ie_against
        FROM pac_direct pd, ie
        """),
        {"id": bioguide_id})
    row = result.mappings().first()
    if not row:
        return {}
    return {
        "pacDirectTotal": float(row.get("pac_direct_total") or 0),
        "superpacIeFor": float(row.get("superpac_ie_for") or 0),
        "superpacIeAgainst": float(row.get("superpac_ie_against") or 0),
    }


async def _get_top_pacs(db: AsyncSession, bioguide_id: str) -> list[dict]:
    """Compute top PACs live from FEC tables."""
    result = await db.execute(
        text("""
        WITH fec_ids AS (
            SELECT unnest(fec_ids) as cand_id FROM congress.legislators WHERE bioguide_id = :id
        ),
        pac_direct AS (
            SELECT cmte_id, SUM(transaction_amt) as direct
            FROM fec.pac_to_candidate
            WHERE cand_id IN (SELECT cand_id FROM fec_ids)
            GROUP BY cmte_id
        ),
        ie_support AS (
            SELECT cmte_id, SUM(transaction_amt) as ie_for
            FROM fec.independent_expenditures
            WHERE cand_id IN (SELECT cand_id FROM fec_ids) AND sup_opp = 'S'
            GROUP BY cmte_id
        ),
        combined AS (
            SELECT COALESCE(p.cmte_id, ie.cmte_id) as cmte_id,
                   COALESCE(p.direct, 0) as direct_contribution,
                   COALESCE(ie.ie_for, 0) as ie_for,
                   COALESCE(p.direct, 0) + COALESCE(ie.ie_for, 0) as total_support
            FROM pac_direct p
            FULL OUTER JOIN ie_support ie ON p.cmte_id = ie.cmte_id
        )
        SELECT c.cmte_id, cn.cmte_name, c.direct_contribution, c.ie_for, c.total_support
        FROM combined c
        LEFT JOIN fec.cmte_names cn ON cn.cmte_id = c.cmte_id
        ORDER BY c.total_support DESC
        LIMIT 20"""),
        {"id": bioguide_id})
    return [{"cmteId": r["cmte_id"], "cmteName": r.get("cmte_name"),
             "directContribution": float(r.get("direct_contribution") or 0),
             "ieFor": float(r.get("ie_for") or 0), "totalSupport": float(r.get("total_support") or 0)}
            for r in result.mappings().all()]


async def _get_top_contributors(db: AsyncSession, bioguide_id: str) -> list[dict]:
    """Top PAC contributors — same as top_pacs but formatted as contributors."""
    # For now, return top PACs as contributors since individual contribution
    # data isn't aggregated per-employer without the derived tables
    return []


def _ideology_label(score: float) -> str:
    if score < _IDEOLOGY_LIBERAL_THRESHOLD:
        return "Liberal"
    elif score > _IDEOLOGY_CONSERVATIVE_THRESHOLD:
        return "Conservative"
    return "Moderate"
