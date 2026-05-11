"""Tier 1a: Donor entity resolution via blocking + embedding + clustering."""
from collections import defaultdict
from pathlib import Path

import numpy as np
import structlog
from sklearn.cluster import AgglomerativeClustering

from pipeline.shared.db import upsert
from pipeline.shared.embeddings import get_model, embed_texts
from pipeline.shared.parquet import duckdb_connect

log = structlog.get_logger()

MODEL_VERSION = "donor_resolution_v1_minilm_thresh015"


def build_blocking_key(last_name: str | None, zip_code: str | None) -> str | None:
    if not last_name or not zip_code:
        return None
    last_name = last_name.strip()
    zip5 = zip_code.strip()[:5]
    if len(last_name) < 2 or len(zip5) < 5:
        return None
    prefix = last_name[:3].lower()
    return f"{prefix}_{zip5}"


def extract_donors_from_parquet(parquet_path: Path) -> list[dict]:
    with duckdb_connect() as conn:
        df = conn.execute(f"""
            SELECT
                CAST(sub_id AS BIGINT) as sub_id,
                name, employer, occupation, city, state, zip_code,
                CONCAT_WS(' ', city, state, zip_code) as address
            FROM read_parquet('{parquet_path}')
            WHERE entity_tp = 'IND' OR entity_tp = '' OR entity_tp IS NULL
        """).fetchdf()

    donors = []
    for _, row in df.iterrows():
        zip_code = str(row.get("zip_code") or "")
        donors.append({
            "sub_id": int(row["sub_id"]) if row["sub_id"] else None,
            "name": str(row.get("name") or ""),
            "employer": str(row.get("employer") or ""),
            "occupation": str(row.get("occupation") or ""),
            "city": str(row.get("city") or ""),
            "state": str(row.get("state") or ""),
            "zip5": zip_code[:5],
            "address": str(row.get("address") or ""),
        })
    log.info("extracted_donors", count=len(donors))
    return donors


def _parse_last_name(name: str) -> str:
    if "," in name:
        return name.split(",")[0].strip()
    parts = name.strip().split()
    return parts[-1] if parts else ""


def cluster_block(donors: list[dict], model, threshold: float = 0.15) -> list[dict]:
    if len(donors) == 1:
        return [{
            "canonical_id": f"d_{donors[0]['sub_id']}",
            "contribution_id": donors[0]["sub_id"],
            "raw_name": donors[0]["name"],
            "raw_employer": donors[0]["employer"],
            "raw_address": donors[0]["address"],
            "confidence": 1.0,
            "model_version": MODEL_VERSION,
        }]

    texts = [f"{d['name']} {d['employer']} {d['address']}".strip() for d in donors]

    if model is None:
        groups = defaultdict(list)
        for i, text in enumerate(texts):
            groups[text.lower()].append(i)
        results = []
        for group_indices in groups.values():
            canonical_id = f"d_{donors[group_indices[0]]['sub_id']}"
            for idx in group_indices:
                results.append({
                    "canonical_id": canonical_id,
                    "contribution_id": donors[idx]["sub_id"],
                    "raw_name": donors[idx]["name"],
                    "raw_employer": donors[idx]["employer"],
                    "raw_address": donors[idx]["address"],
                    "confidence": 1.0,
                    "model_version": MODEL_VERSION,
                })
        return results

    embeddings = embed_texts(model, texts)
    embedding_matrix = np.array(embeddings)

    clustering = AgglomerativeClustering(
        n_clusters=None, distance_threshold=threshold,
        metric="cosine", linkage="average",
    )
    labels = clustering.fit_predict(embedding_matrix)

    centroids = {}
    for label in set(labels):
        mask = labels == label
        centroids[label] = embedding_matrix[mask].mean(axis=0)

    results = []
    for i, donor in enumerate(donors):
        label = labels[i]
        cluster_members = [j for j, l in enumerate(labels) if l == label]
        canonical_sub_id = donors[min(cluster_members)]["sub_id"]
        centroid = centroids[label]
        cos_sim = np.dot(embedding_matrix[i], centroid) / (
            np.linalg.norm(embedding_matrix[i]) * np.linalg.norm(centroid) + 1e-8
        )
        confidence = float(max(0.0, min(1.0, cos_sim)))
        results.append({
            "canonical_id": f"d_{canonical_sub_id}",
            "contribution_id": donor["sub_id"],
            "raw_name": donor["name"],
            "raw_employer": donor["employer"],
            "raw_address": donor["address"],
            "confidence": confidence,
            "model_version": MODEL_VERSION,
        })
    return results


def run_donor_resolution(parquet_path: Path, threshold: float = 0.15, block_batch_size: int = 10_000) -> int:
    model = get_model()
    donors = extract_donors_from_parquet(parquet_path)

    blocks: dict[str, list[dict]] = defaultdict(list)
    skipped = 0
    for donor in donors:
        last_name = _parse_last_name(donor["name"])
        key = build_blocking_key(last_name, donor["zip5"])
        if key is None:
            skipped += 1
            continue
        blocks[key].append(donor)

    log.info("donor_blocks_built", blocks=len(blocks), donors=len(donors), skipped=skipped)

    all_results = []
    processed_blocks = 0
    for block_key, block_donors in blocks.items():
        results = cluster_block(block_donors, model, threshold)
        all_results.extend(results)
        if len(all_results) >= block_batch_size:
            upsert("donor_canonical", all_results, schema="enrichment")
            log.info("donor_batch_uploaded", rows=len(all_results), blocks=processed_blocks)
            all_results = []
        processed_blocks += 1

    if all_results:
        upsert("donor_canonical", all_results, schema="enrichment")

    total = sum(len(block) for block in blocks.values())
    log.info("donor_resolution_complete", total_donors=total, blocks=len(blocks))
    return total
