# pipeline/enrich/donor_clustering.py
"""Tier 2a: Donor behavioral clustering via UMAP + HDBSCAN.

Reads condensed canonical donors from enrichment.donor_canonical,
clusters them by behavioral features, and stores results in
analytics.donor_cluster + analytics.donor_feature_vectors.
"""
import numpy as np
import structlog
import psycopg2.extras

from shared.db import upsert, get_conn

log = structlog.get_logger()
MODEL_VERSION = "donor_cluster_v1_umap_hdbscan"


def build_donor_features(donor: dict) -> list[float]:
    return [
        float(donor.get("total_amount") or 0),
        float(donor.get("contribution_count") or 0),
        float(donor.get("cmte_count") or 0),
    ]


def cluster_donors(features: np.ndarray, min_cluster_size: int = 5, n_components: int = 10) -> tuple[np.ndarray, np.ndarray]:
    import umap
    import hdbscan
    from sklearn.preprocessing import StandardScaler

    n_comp = min(n_components, features.shape[1], features.shape[0] - 2)
    if n_comp < 2:
        n_comp = 2

    scaler = StandardScaler()
    scaled = scaler.fit_transform(features)
    reducer = umap.UMAP(n_components=n_comp, metric="euclidean", random_state=42)
    reduced = reducer.fit_transform(scaled)
    clusterer = hdbscan.HDBSCAN(min_cluster_size=min_cluster_size, metric="euclidean", cluster_selection_method="eom")
    labels = clusterer.fit_predict(reduced)

    log.info("donors_clustered", n_clusters=len(set(labels) - {-1}), noise=int((labels == -1).sum()), total=len(labels))
    return labels, reduced


def run_donor_clustering() -> int:
    """Run clustering on canonical donors. No parquet needed — reads from DB."""
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Clear previous results
    cur.execute("DELETE FROM analytics.donor_cluster WHERE model_version = %s", (MODEL_VERSION,))
    cur.execute("DELETE FROM analytics.donor_feature_vectors WHERE model_version = %s", (MODEL_VERSION,))
    log.info("cleared_previous_clustering_results")

    # Load canonical donors
    cur.execute("""
        SELECT canonical_id, total_amount, contribution_count,
               array_length(cmte_ids, 1) as cmte_count
        FROM enrichment.donor_canonical
        WHERE total_amount >= 200
    """)
    rows = [dict(r) for r in cur.fetchall()]
    if len(rows) < 10:
        log.warning("insufficient_donors_for_clustering", count=len(rows))
        return 0

    log.info("canonical_donors_loaded", count=len(rows))

    canonical_ids = [r["canonical_id"] for r in rows]
    features = np.array([build_donor_features(r) for r in rows])
    labels, reduced = cluster_donors(features, min_cluster_size=max(2, len(features) // 100))

    # Compute centroids per cluster
    centroids: dict[int, np.ndarray] = {}
    for label in set(labels):
        if label == -1:
            continue
        mask = labels == label
        centroids[label] = reduced[mask].mean(axis=0)

    # Build cluster assignment rows
    cluster_rows = []
    for i, canonical_id in enumerate(canonical_ids):
        label = labels[i]
        dist = float(np.linalg.norm(reduced[i] - centroids[label])) if label != -1 and label in centroids else None
        cluster_rows.append({
            "canonical_donor_id": canonical_id, "cluster_id": int(label),
            "cluster_label": None, "distance_to_centroid": dist, "model_version": MODEL_VERSION,
        })
    upsert("donor_cluster", cluster_rows, schema="analytics")

    # Build feature vector rows (pad/trim to 64 dims for pgvector)
    target_dim = 64
    if reduced.shape[1] < target_dim:
        padded = np.zeros((reduced.shape[0], target_dim))
        padded[:, :reduced.shape[1]] = reduced
    else:
        padded = reduced[:, :target_dim]

    vector_rows = []
    for i, canonical_id in enumerate(canonical_ids):
        vector_rows.append({
            "canonical_donor_id": canonical_id, "embedding": padded[i].tolist(),
            "total_amount": rows[i]["total_amount"],
            "contribution_count": rows[i]["contribution_count"],
            # Placeholders: real party/recipient splits not available in condensed schema (DB columns are NOT NULL)
            "party_split_d": 0.0, "party_split_r": 0.0,
            "recipient_type_candidate": 0.0,
            "recipient_type_pac": 0.0,
            "geographic_spread": float(rows[i].get("cmte_count") or 0), "model_version": MODEL_VERSION,
        })
    upsert("donor_feature_vectors", vector_rows, on_conflict="canonical_donor_id", schema="analytics")

    total = len(cluster_rows) + len(vector_rows)
    log.info("donor_clustering_complete", clusters=len(set(labels) - {-1}), rows=total)
    return total
