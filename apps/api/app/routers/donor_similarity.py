# apps/api/app/routers/donor_similarity.py
"""Donor similarity search via pgvector nearest-neighbor."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.deps import get_db

router = APIRouter(tags=["ml"])

@router.get("/api/donors/{canonical_donor_id}/similar")
async def find_similar_donors(
    canonical_donor_id: str,
    limit: int = Query(default=10, le=50),
    db: AsyncSession = Depends(get_db),
):
    embed_result = await db.execute(
        text("""SELECT embedding, total_amount, contribution_count,
                       party_split_d, party_split_r, recipient_type_candidate,
                       recipient_type_pac, geographic_spread
                FROM analytics.donor_feature_vectors WHERE canonical_donor_id = :id"""),
        {"id": canonical_donor_id},
    )
    donor = embed_result.mappings().first()
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found or not yet clustered")

    sql = """
    SELECT dfv.canonical_donor_id,
           1 - (dfv.embedding <=> (SELECT embedding FROM analytics.donor_feature_vectors WHERE canonical_donor_id = :id)) AS similarity,
           dfv.total_amount, dfv.contribution_count, dfv.party_split_d, dfv.party_split_r,
           dfv.recipient_type_candidate, dfv.recipient_type_pac, dfv.geographic_spread,
           dc.cluster_id, dc.cluster_label
    FROM analytics.donor_feature_vectors dfv
    LEFT JOIN analytics.donor_cluster dc ON dc.canonical_donor_id = dfv.canonical_donor_id
    WHERE dfv.canonical_donor_id != :id
    ORDER BY dfv.embedding <=> (SELECT embedding FROM analytics.donor_feature_vectors WHERE canonical_donor_id = :id)
    LIMIT :limit
    """
    result = await db.execute(text(sql), {"id": canonical_donor_id, "limit": limit})
    rows = result.mappings().all()

    source_cluster_result = await db.execute(
        text("SELECT cluster_id, cluster_label FROM analytics.donor_cluster WHERE canonical_donor_id = :id"),
        {"id": canonical_donor_id},
    )
    source_cluster = source_cluster_result.mappings().first()

    similar_donors = []
    for r in rows:
        similar_donors.append({
            "canonicalDonorId": r["canonical_donor_id"],
            "similarity": round(float(r["similarity"]), 4),
            "totalAmount": float(r.get("total_amount") or 0),
            "contributionCount": int(r.get("contribution_count") or 0),
            "partySplitD": round(float(r.get("party_split_d") or 0), 3),
            "partySplitR": round(float(r.get("party_split_r") or 0), 3),
            "sameCluster": r.get("cluster_id") == (source_cluster["cluster_id"] if source_cluster else None),
            "clusterId": r.get("cluster_id"),
            "clusterLabel": r.get("cluster_label"),
        })

    return {
        "donorId": canonical_donor_id,
        "sourceCluster": {"id": source_cluster["cluster_id"] if source_cluster else None,
                          "label": source_cluster["cluster_label"] if source_cluster else None},
        "similarDonors": similar_donors,
    }
