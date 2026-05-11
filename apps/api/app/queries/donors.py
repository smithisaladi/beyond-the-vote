# apps/api/app/queries/donors.py
"""PAC detail and leaderboard queries."""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def pac_leaderboard(session: AsyncSession, *, q: str | None = None, limit: int = 20, offset: int = 0) -> tuple[list[dict], int]:
    params: dict = {"limit": limit, "offset": offset}
    if q:
        where = "cmte_name ILIKE :pattern"
        params["pattern"] = f"%{q}%"
    else:
        where = "TRUE"
    sql = f"""SELECT *, COUNT(*) OVER() AS total_count
    FROM derived.contributor_leaderboard_cache WHERE {where}
    ORDER BY total_contributions DESC LIMIT :limit OFFSET :offset"""
    result = await session.execute(text(sql), params)
    rows = result.mappings().all()
    total = rows[0]["total_count"] if rows else 0
    return [dict(r) for r in rows], total


async def pac_detail(session: AsyncSession, cmte_id: str) -> dict | None:
    sql = """
    WITH cmte_info AS (
        SELECT cmte_id, cmte_name, connected_org FROM fec.cmte_names WHERE cmte_id = :cmte_id
    ),
    direct AS (
        SELECT cand_id, SUM(transaction_amt) AS direct_total FROM fec.pac_to_candidate WHERE cmte_id = :cmte_id GROUP BY cand_id
    ),
    ie AS (
        SELECT cand_id, sup_opp, SUM(transaction_amt) AS ie_total FROM fec.independent_expenditures WHERE cmte_id = :cmte_id GROUP BY cand_id, sup_opp
    ),
    per_candidate AS (
        SELECT COALESCE(d.cand_id, ie_for.cand_id, ie_against.cand_id) AS cand_id,
               COALESCE(d.direct_total, 0) AS direct,
               COALESCE(ie_for.ie_total, 0) AS ie_for,
               COALESCE(ie_against.ie_total, 0) AS ie_against
        FROM direct d
        FULL OUTER JOIN (SELECT * FROM ie WHERE sup_opp = 'S') ie_for ON d.cand_id = ie_for.cand_id
        FULL OUTER JOIN (SELECT * FROM ie WHERE sup_opp = 'O') ie_against ON COALESCE(d.cand_id, ie_for.cand_id) = ie_against.cand_id
    )
    SELECT ci.cmte_name, ci.connected_org,
           pc.cand_id, pc.direct, pc.ie_for, pc.ie_against,
           pc.direct + pc.ie_for AS total_support,
           l.bioguide_id, l.full_name, l.party, l.state, l.chamber
    FROM cmte_info ci
    CROSS JOIN per_candidate pc
    LEFT JOIN congress.legislators l ON pc.cand_id = ANY(l.fec_ids)
    ORDER BY total_support DESC LIMIT 20
    """
    result = await session.execute(text(sql), {"cmte_id": cmte_id})
    rows = result.mappings().all()
    if not rows:
        return None

    first = rows[0]
    recipients = []
    total_direct = total_ie_for = total_ie_against = 0.0
    for r in rows:
        direct = float(r.get("direct") or 0)
        ie_for = float(r.get("ie_for") or 0)
        ie_against = float(r.get("ie_against") or 0)
        total_direct += direct
        total_ie_for += ie_for
        total_ie_against += ie_against
        recipients.append({
            "bioguideId": r.get("bioguide_id"), "name": r.get("full_name"),
            "party": r.get("party"), "state": r.get("state"), "chamber": r.get("chamber"),
            "direct": direct, "ieFor": ie_for, "ieAgainst": ie_against, "amount": direct + ie_for,
        })

    return {
        "cmteId": cmte_id, "name": first["cmte_name"], "connectedOrg": first.get("connected_org"),
        "directTotal": total_direct, "ieForTotal": total_ie_for, "ieAgainstTotal": total_ie_against,
        "totalContributions": total_direct + total_ie_for + total_ie_against,
        "recipientCount": len(recipients), "recipients": recipients,
    }
