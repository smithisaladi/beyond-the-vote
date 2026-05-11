# pipeline/enrich/donor_clustering.py
"""Tier 2a: Donor behavioral clustering via UMAP + HDBSCAN."""
from collections import defaultdict
from pathlib import Path
import numpy as np
import structlog
import psycopg2.extras

from shared.db import upsert, get_conn
from shared.parquet import duckdb_connect

log = structlog.get_logger()
MODEL_VERSION = "donor_cluster_v1_umap_hdbscan"


def build_donor_features(donor: dict) -> list[float]:
    return [
        float(donor.get("total_amount") or 0),
        float(donor.get("contribution_count") or 0),
        float(donor.get("party_d_pct") or 0),
        float(donor.get("party_r_pct") or 0),
        float(donor.get("candidate_pct") or 0),
        float(donor.get("pac_pct") or 0),
        float(donor.get("state_count") or 0),
    ]


def compute_feature_vectors(parquet_path: Path, canonical_map: dict[str, str]) -> list[dict]:
    with duckdb_connect() as conn:
        df = conn.execute(f"""
            SELECT CAST(sub_id AS VARCHAR) as sub_id, transaction_amt, cmte_id, state
            FROM read_parquet('{parquet_path}')
            WHERE entity_tp = 'IND' OR entity_tp = '' OR entity_tp IS NULL
        """).fetchdf()

    agg: dict[str, dict] = defaultdict(lambda: {
        "total_amount": 0.0, "contribution_count": 0, "cmte_ids": set(), "states": set(),
    })
    for _, row in df.iterrows():
        sub_id = str(row.get("sub_id") or "")
        canonical_id = canonical_map.get(sub_id)
        if not canonical_id:
            continue
        amt = float(row.get("transaction_amt") or 0)
        agg[canonical_id]["total_amount"] += amt
        agg[canonical_id]["contribution_count"] += 1
        cmte = str(row.get("cmte_id") or "")
        if cmte:
            agg[canonical_id]["cmte_ids"].add(cmte)
        state = str(row.get("state") or "")
        if state:
            agg[canonical_id]["states"].add(state)

    results = []
    for canonical_id, data in agg.items():
        donor = {
            "canonical_id": canonical_id, "total_amount": data["total_amount"],
            "contribution_count": data["contribution_count"],
            "party_d_pct": 0.0, "party_r_pct": 0.0, "candidate_pct": 0.5, "pac_pct": 0.5,
            "state_count": len(data["states"]),
        }
        features = build_donor_features(donor)
        results.append({"canonical_id": canonical_id, "features": features})
    log.info("feature_vectors_computed", donors=len(results))
    return results


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


def run_donor_clustering(parquet_path: Path) -> int:
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Clear previous results for this model version
    cur.execute("DELETE FROM analytics.donor_cluster WHERE model_version = %s", (MODEL_VERSION,))
    cur.execute("DELETE FROM analytics.donor_feature_vectors WHERE model_version = %s", (MODEL_VERSION,))
    log.info("cleared_previous_clustering_results")

    cur.execute("SELECT contribution_id, canonical_id FROM enrichment.donor_canonical")
    result_data = [dict(r) for r in cur.fetchall()]
    if not result_data:
        log.warning("no_canonical_donors_found")
        return 0
    canonical_map = {str(r["contribution_id"]): r["canonical_id"] for r in result_data}
    log.info("canonical_map_loaded", entries=len(canonical_map))

    donor_vectors = compute_feature_vectors(parquet_path, canonical_map)
    if len(donor_vectors) < 10:
        log.warning("insufficient_donors_for_clustering", count=len(donor_vectors))
        return 0

    canonical_ids = [d["canonical_id"] for d in donor_vectors]
    features = np.array([d["features"] for d in donor_vectors])
    labels, reduced = cluster_donors(features, min_cluster_size=max(2, len(features) // 100))

    cluster_rows = []
    centroids: dict[int, np.ndarray] = {}
    for label in set(labels):
        if label == -1:
            continue
        mask = labels == label
        centroids[label] = reduced[mask].mean(axis=0)

    for i, canonical_id in enumerate(canonical_ids):
        label = labels[i]
        dist = float(np.linalg.norm(reduced[i] - centroids[label])) if label != -1 and label in centroids else None
        cluster_rows.append({
            "canonical_donor_id": canonical_id, "cluster_id": int(label),
            "cluster_label": None, "distance_to_centroid": dist, "model_version": MODEL_VERSION,
        })
    upsert("donor_cluster", cluster_rows, schema="analytics")

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
            "total_amount": donor_vectors[i]["features"][0],
            "contribution_count": int(donor_vectors[i]["features"][1]),
            "party_split_d": donor_vectors[i]["features"][2], "party_split_r": donor_vectors[i]["features"][3],
            "recipient_type_candidate": donor_vectors[i]["features"][4],
            "recipient_type_pac": donor_vectors[i]["features"][5],
            "geographic_spread": donor_vectors[i]["features"][6], "model_version": MODEL_VERSION,
        })
    upsert("donor_feature_vectors", vector_rows, on_conflict="canonical_donor_id", schema="analytics")

    total = len(cluster_rows) + len(vector_rows)
    log.info("donor_clustering_complete", clusters=len(set(labels) - {-1}), rows=total)
    return total
