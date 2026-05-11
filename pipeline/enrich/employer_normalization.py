"""Tier 1b: Employer normalization via embedding + HDBSCAN clustering."""
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import structlog

from shared.db import upsert
from shared.embeddings import get_model, embed_texts
from shared.parquet import duckdb_connect
from enrich.stopwords import is_non_employer, normalize_employer_string

log = structlog.get_logger()

MODEL_VERSION = "employer_norm_v1_minilm_hdbscan"


def extract_unique_employers(parquet_path: Path) -> list[str]:
    with duckdb_connect() as conn:
        result = conn.execute(f"""
            SELECT DISTINCT employer
            FROM read_parquet('{parquet_path}')
            WHERE employer IS NOT NULL AND employer != ''
        """).fetchdf()

    employers = []
    seen = set()
    for _, row in result.iterrows():
        raw = str(row["employer"])
        if is_non_employer(raw):
            continue
        normalized = normalize_employer_string(raw)
        if normalized and normalized not in seen:
            seen.add(normalized)
            employers.append(raw.strip())

    log.info("unique_employers_extracted", count=len(employers))
    return employers


def pick_canonical_name(variants: list[str]) -> str:
    if not variants:
        return ""
    if len(variants) == 1:
        return variants[0]

    counts = Counter(v.lower() for v in variants)
    by_lower: dict[str, list[str]] = defaultdict(list)
    for v in variants:
        by_lower[v.lower()].append(v)

    sorted_keys = sorted(counts.keys(), key=lambda k: (-counts[k], -len(k)))
    best_lower = sorted_keys[0]

    candidates = by_lower[best_lower]
    for c in candidates:
        if c != c.upper() and c != c.lower():
            return c
    return candidates[0]


def cluster_employers(employers: list[str], model, min_cluster_size: int = 2) -> list[list[int]]:
    if not employers:
        return []

    if model is None:
        groups: dict[str, list[int]] = defaultdict(list)
        for i, emp in enumerate(employers):
            groups[emp.lower()].append(i)
        return list(groups.values())

    embeddings = embed_texts(model, employers)
    embedding_matrix = np.array(embeddings)

    import hdbscan
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        metric="euclidean",
        cluster_selection_method="eom",
    )
    labels = clusterer.fit_predict(embedding_matrix)

    clusters_map: dict[int, list[int]] = defaultdict(list)
    noise_id = max(labels) + 1 if len(labels) > 0 else 0
    for i, label in enumerate(labels):
        if label == -1:
            clusters_map[noise_id] = [i]
            noise_id += 1
        else:
            clusters_map[label].append(i)

    return list(clusters_map.values())


def run_employer_normalization(parquet_path: Path) -> int:
    model = get_model()
    employers = extract_unique_employers(parquet_path)

    if not employers:
        log.warning("no_employers_to_normalize")
        return 0

    clusters = cluster_employers(employers, model)
    log.info("employer_clusters", count=len(clusters))

    rows = []
    for cluster_indices in clusters:
        variants = [employers[i] for i in cluster_indices]
        canonical_name = pick_canonical_name(variants)
        canonical_id = f"emp_{hash(canonical_name.lower()) & 0xFFFFFFFF:08x}"

        for idx in cluster_indices:
            rows.append({
                "canonical_employer_id": canonical_id,
                "raw_string": employers[idx],
                "canonical_name": canonical_name,
                "confidence": 1.0 if len(cluster_indices) == 1 else 0.85,
                "model_version": MODEL_VERSION,
            })

    total = upsert("employer_canonical", rows, schema="enrichment")
    log.info("employer_normalization_complete", clusters=len(clusters), rows=total)
    return total
