"""Bill search and lookup queries using raw SQL."""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def hybrid_bill_search(
    session: AsyncSession,
    query: str,
    query_embedding: list[float] | None = None,
    *,
    status: list[str] | None = None,
    topics: list[str] | None = None,
    congress: int | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """3-signal hybrid search: FTS + trigram + semantic (when embedding provided)."""
    filters = []
    params: dict = {"query": query, "limit": limit, "offset": offset}

    if status:
        filters.append("b.status = ANY(:statuses)")
        params["statuses"] = status
    if topics:
        filters.append("b.topics && :topics")
        params["topics"] = topics
    if congress:
        filters.append("b.congress = :congress")
        params["congress"] = congress

    where_clause = " AND ".join(filters) if filters else "TRUE"

    ctes = f"""
    WITH tsq AS (
        SELECT websearch_to_tsquery('english', :query) AS q
    ),
    fts AS (
        SELECT b.bill_id,
               ts_rank_cd(b.search_vector, tsq.q) AS fts_score,
               ROW_NUMBER() OVER (ORDER BY ts_rank_cd(b.search_vector, tsq.q) DESC) AS fts_rank
        FROM congress.bills b, tsq
        WHERE b.search_vector @@ tsq.q AND {where_clause}
        LIMIT 100
    ),
    trgm AS (
        SELECT b.bill_id,
               similarity(b.title, :query) AS trgm_score,
               ROW_NUMBER() OVER (ORDER BY similarity(b.title, :query) DESC) AS trgm_rank
        FROM congress.bills b
        WHERE similarity(b.title, :query) > 0.1 AND {where_clause}
        LIMIT 100
    ),
    """

    if query_embedding is not None:
        params["embedding"] = str(query_embedding)
        ctes += f"""
    semantic AS (
        SELECT be.bill_id,
               1 - (be.embedding <=> CAST(:embedding AS vector)) AS sem_score,
               ROW_NUMBER() OVER (ORDER BY be.embedding <=> CAST(:embedding AS vector)) AS sem_rank
        FROM enrichment.bill_embeddings be
        JOIN congress.bills b ON b.bill_id = be.bill_id
        WHERE {where_clause}
        LIMIT 100
    ),
    fused AS (
        SELECT COALESCE(f.bill_id, t.bill_id, s.bill_id) AS bill_id,
               COALESCE(1.0 / (60 + f.fts_rank), 0) +
               COALESCE(0.5 / (60 + t.trgm_rank), 0) +
               COALESCE(0.8 / (60 + s.sem_rank), 0) AS rrf_score
        FROM fts f
        FULL OUTER JOIN trgm t ON f.bill_id = t.bill_id
        FULL OUTER JOIN semantic s ON COALESCE(f.bill_id, t.bill_id) = s.bill_id
    )
    """
    else:
        ctes += """
    fused AS (
        SELECT COALESCE(f.bill_id, t.bill_id) AS bill_id,
               COALESCE(1.0 / (60 + f.fts_rank), 0) +
               COALESCE(0.5 / (60 + t.trgm_rank), 0) AS rrf_score
        FROM fts f
        FULL OUTER JOIN trgm t ON f.bill_id = t.bill_id
    )
    """

    sql = ctes + """
    SELECT b.*, fused.rrf_score,
           COUNT(*) OVER() AS total_count
    FROM fused
    JOIN congress.bills b ON b.bill_id = fused.bill_id
    ORDER BY fused.rrf_score DESC
    LIMIT :limit OFFSET :offset
    """

    result = await session.execute(text(sql), params)
    rows = result.mappings().all()
    total = rows[0]["total_count"] if rows else 0
    return [dict(r) for r in rows], total


async def lookup_bill(session: AsyncSession, bill_id: str) -> dict | None:
    sql = """
    SELECT * FROM congress.bills
    WHERE bill_id = :bill_id OR LOWER(bill_number) = LOWER(:bill_id)
    LIMIT 1
    """
    result = await session.execute(text(sql), {"bill_id": bill_id})
    row = result.mappings().first()
    return dict(row) if row else None


async def get_bills_by_topic(
    session: AsyncSession,
    topic: str,
    *,
    status: str | None = None,
    limit: int = 20,
) -> list[dict]:
    params: dict = {"topic": topic, "limit": limit}
    where = "topics @> ARRAY[:topic]::text[]"
    if status:
        where += " AND status = :status"
        params["status"] = status

    sql = f"""
    SELECT * FROM congress.bills WHERE {where}
    ORDER BY synced_at DESC LIMIT :limit
    """
    result = await session.execute(text(sql), params)
    return [dict(r) for r in result.mappings().all()]


async def get_bill_votes(session: AsyncSession, bill_id: str) -> list[dict]:
    sql = """
    SELECT vs.*,
           json_agg(json_build_object(
               'bioguide_id', vp.bioguide_id,
               'position', vp.position,
               'name', l.full_name,
               'party', l.party,
               'state', l.state,
               'photo_url', l.photo_url
           )) AS member_positions
    FROM congress.bill_vote_summaries vs
    LEFT JOIN congress.bill_vote_positions vp ON vp.vote_id = vs.id
    LEFT JOIN congress.legislators l ON l.bioguide_id = vp.bioguide_id
    WHERE vs.bill_id = :bill_id
    GROUP BY vs.id
    ORDER BY vs.date DESC
    LIMIT 20
    """
    result = await session.execute(text(sql), {"bill_id": bill_id})
    return [dict(r) for r in result.mappings().all()]
