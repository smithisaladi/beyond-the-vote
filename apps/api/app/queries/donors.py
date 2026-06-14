"""PAC detail and leaderboard queries — derived table first, live fallback."""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_PAC_LEADERBOARD_SQL = text("""
WITH pac_totals AS (
    SELECT cmte_id, SUM(transaction_amt) as direct_total
    FROM fec.pac_to_candidate
    WHERE (:cycle IS NULL OR cycle = :cycle)
    GROUP BY cmte_id
),
ie_totals AS (
    SELECT cmte_id,
           SUM(CASE WHEN sup_opp = 'S' THEN transaction_amt ELSE 0 END) as ie_for_total,
           SUM(CASE WHEN sup_opp = 'O' THEN transaction_amt ELSE 0 END) as ie_against_total
    FROM fec.independent_expenditures
    WHERE (:cycle IS NULL OR cycle = :cycle)
    GROUP BY cmte_id
),
combined AS (
    SELECT COALESCE(p.cmte_id, ie.cmte_id) as cmte_id,
           COALESCE(p.direct_total, 0) as direct_total,
           COALESCE(ie.ie_for_total, 0) as ie_for_total,
           COALESCE(ie.ie_against_total, 0) as ie_against_total,
           COALESCE(p.direct_total, 0) + COALESCE(ie.ie_for_total, 0) + COALESCE(ie.ie_against_total, 0) as total_contributions
    FROM pac_totals p
    FULL OUTER JOIN ie_totals ie ON p.cmte_id = ie.cmte_id
),
ranked AS (
    SELECT c.cmte_id, cn.cmte_name,
           c.direct_total, c.ie_for_total, c.ie_against_total, c.total_contributions,
           ROW_NUMBER() OVER (ORDER BY c.total_contributions DESC) AS global_rank
    FROM combined c
    LEFT JOIN fec.cmte_names cn ON cn.cmte_id = c.cmte_id
    WHERE cn.cmte_name IS NOT NULL
)
SELECT cmte_id, cmte_name, direct_total, ie_for_total, ie_against_total,
       total_contributions, global_rank,
       COUNT(*) OVER() AS total_count
FROM ranked
WHERE (:pattern IS NULL OR cmte_name ILIKE :pattern)
ORDER BY total_contributions DESC
LIMIT :limit OFFSET :offset
""")

_PAC_DETAIL_SQL = text("""
WITH direct AS (
    SELECT cand_id, SUM(transaction_amt) AS direct_total FROM fec.pac_to_candidate
    WHERE cmte_id = :cmte_id AND (:cycle IS NULL OR cycle = :cycle)
    GROUP BY cand_id
),
ie AS (
    SELECT cand_id, sup_opp, SUM(transaction_amt) AS ie_total FROM fec.independent_expenditures
    WHERE cmte_id = :cmte_id AND (:cycle IS NULL OR cycle = :cycle)
    GROUP BY cand_id, sup_opp
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
SELECT
    (SELECT cmte_name FROM fec.cmte_names WHERE cmte_id = :cmte_id) AS cmte_name,
    (SELECT connected_org FROM fec.cmte_names WHERE cmte_id = :cmte_id) AS connected_org,
    pc.cand_id, pc.direct, pc.ie_for, pc.ie_against,
    pc.direct + pc.ie_for AS total_support,
    l.bioguide_id, COALESCE(l.full_name, fc.cand_name) as full_name,
    COALESCE(l.party, fc.cand_party) as party,
    COALESCE(l.state, fc.cand_state) as state,
    l.chamber
FROM per_candidate pc
LEFT JOIN congress.legislators l ON pc.cand_id = ANY(l.fec_ids)
LEFT JOIN fec.candidates fc ON fc.cand_id = pc.cand_id
WHERE pc.direct + pc.ie_for + pc.ie_against > 0
ORDER BY total_support DESC
""")


def _format_live_pac_detail(cmte_id: str, rows) -> dict | None:
    """Format response from live _PAC_DETAIL_SQL rows."""
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


def _format_derived_pac_detail(cmte_id: str, rows) -> dict | None:
    """Format response from derived.pac_detail_cache rows."""
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


async def pac_leaderboard(session: AsyncSession, *, q: str | None = None, cycle: int | None = None, limit: int = 20, offset: int = 0) -> tuple[list[dict], int]:
    """Leaderboard: derived table when no cycle filter, otherwise live query."""
    if cycle is None:
        try:
            exists_result = await session.execute(
                text("SELECT EXISTS(SELECT 1 FROM derived.pac_leaderboard LIMIT 1)")
            )
            has_data = exists_result.scalar_one_or_none()
            if has_data:
                derived_result = await session.execute(
                    text("""
                        SELECT cmte_id, cmte_name, direct_total, ie_for_total, ie_against_total,
                               total_contributions, global_rank,
                               COUNT(*) OVER() AS total_count
                        FROM derived.pac_leaderboard
                        WHERE (:pattern IS NULL OR cmte_name ILIKE :pattern)
                        ORDER BY total_contributions DESC
                        LIMIT :limit OFFSET :offset
                    """),
                    {"pattern": f"%{q}%" if q else None, "limit": limit, "offset": offset},
                )
                rows = derived_result.mappings().all()
                total = rows[0]["total_count"] if rows else 0
                return [dict(r) for r in rows], total
        except Exception:
            pass

    params: dict = {
        "limit": limit,
        "offset": offset,
        "cycle": cycle,
        "pattern": f"%{q}%" if q else None,
    }
    result = await session.execute(_PAC_LEADERBOARD_SQL, params)
    rows = result.mappings().all()
    total = rows[0]["total_count"] if rows else 0
    return [dict(r) for r in rows], total


async def pac_detail(session: AsyncSession, cmte_id: str, cycle: int | None = None) -> dict | None:
    """Get PAC detail: derived table when no cycle filter, otherwise live query."""
    if cycle is None:
        try:
            exists_result = await session.execute(
                text("SELECT EXISTS(SELECT 1 FROM derived.pac_detail_cache WHERE cmte_id = :cmte_id LIMIT 1)"),
                {"cmte_id": cmte_id},
            )
            has_data = exists_result.scalar_one_or_none()
            if has_data:
                derived_result = await session.execute(
                    text("""
                        SELECT cmte_id, cmte_name, connected_org, cand_id, full_name, party, state,
                               chamber, bioguide_id, direct, ie_for, ie_against
                        FROM derived.pac_detail_cache
                        WHERE cmte_id = :cmte_id
                        ORDER BY direct + ie_for DESC
                    """),
                    {"cmte_id": cmte_id},
                )
                rows = derived_result.mappings().all()
                result = _format_derived_pac_detail(cmte_id, rows)
                if result:
                    return result
        except Exception:
            pass

    params: dict = {"cmte_id": cmte_id, "cycle": cycle}
    result = await session.execute(_PAC_DETAIL_SQL, params)
    rows = result.mappings().all()
    return _format_live_pac_detail(cmte_id, rows)
