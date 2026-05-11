"""Tier 1b: Employer normalization via embedding + HDBSCAN clustering.

Uses blocking by first 3 characters to keep cluster sizes manageable.
947K unique employers → ~15K blocks → HDBSCAN per block.
"""
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import structlog

from shared.db import upsert
from shared.embeddings import get_model, embed_texts
from shared.parquet import duckdb_connect
from enrich.stopwords import is_non_employer, normalize_employer_string

log = structlog.get_logger()

MODEL_VERSION = "employer_norm_v2_blocked_hdbscan"

# Max block size before we skip HDBSCAN and just use exact-match grouping
MAX_BLOCK_FOR_HDBSCAN = 5000


def extract_unique_employers(parquet_path: Path) -> list[str]:
    """Extract unique non-stopword employer strings from individual contributions."""
    from shared.parquet import read_parquet_batched

    seen = set()
    employers = []
    for batch in read_parquet_batched(parquet_path, batch_size=200_000):
        for row in batch:
            raw = str(row.get("employer") or "")
            if not raw or is_non_employer(raw):
                continue
            normalized = normalize_employer_string(raw)
            if normalized and normalized not in seen:
                seen.add(normalized)
                employers.append(raw.strip())

    log.info("unique_employers_extracted", count=len(employers))
    return employers


def pick_canonical_name(variants: list[str]) -> str:
    """Pick the best canonical name from a list of variants."""
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
            return c  # Prefer mixed case
    return candidates[0]


def _blocking_key(employer: str) -> str:
    """Generate a blocking key from the first 3 chars of the normalized employer."""
    normalized = normalize_employer_string(employer)
    if len(normalized) < 3:
        return normalized or "_short"
    return normalized[:3]


def cluster_block(employers: list[str], model, min_cluster_size: int = 2) -> list[list[int]]:
    """Cluster a single block of employers. Returns list of clusters (each is list of indices)."""
    if not employers:
        return []

    # Exact-match fallback for testing or oversized blocks
    if model is None or len(employers) > MAX_BLOCK_FOR_HDBSCAN:
        groups: dict[str, list[int]] = defaultdict(list)
        for i, emp in enumerate(employers):
            groups[emp.lower()].append(i)
        return list(groups.values())

    # Single employer = its own cluster
    if len(employers) == 1:
        return [[0]]

    # Need at least min_cluster_size for HDBSCAN
    if len(employers) < min_cluster_size + 1:
        # Too few for HDBSCAN — use exact match
        groups = defaultdict(list)
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
    """Run employer normalization with blocking. Returns rows uploaded."""
    model = get_model()
    employers = extract_unique_employers(parquet_path)

    if not employers:
        log.warning("no_employers_to_normalize")
        return 0

    # Build blocks by prefix
    blocks: dict[str, list[int]] = defaultdict(list)
    for i, emp in enumerate(employers):
        key = _blocking_key(emp)
        blocks[key].append(i)

    log.info("employer_blocks_built", blocks=len(blocks), employers=len(employers))

    all_rows = []
    processed = 0

    for block_key, indices in blocks.items():
        block_employers = [employers[i] for i in indices]
        clusters = cluster_block(block_employers, model)

        for cluster_indices in clusters:
            variants = [block_employers[i] for i in cluster_indices]
            canonical_name = pick_canonical_name(variants)
            canonical_id = f"emp_{hash(canonical_name.lower()) & 0xFFFFFFFF:08x}"

            for idx in cluster_indices:
                original_idx = indices[idx]
                all_rows.append({
                    "canonical_employer_id": canonical_id,
                    "raw_string": employers[original_idx],
                    "canonical_name": canonical_name,
                    "confidence": 1.0 if len(cluster_indices) == 1 else 0.85,
                    "model_version": MODEL_VERSION,
                })

        processed += 1

        # Upload in batches of 10K rows
        if len(all_rows) >= 10000:
            upsert("employer_canonical", all_rows, schema="enrichment")
            log.info("employer_batch_uploaded", rows=len(all_rows), blocks_done=processed, total_blocks=len(blocks))
            all_rows = []

    # Upload remaining
    if all_rows:
        upsert("employer_canonical", all_rows, schema="enrichment")

    total = sum(len(indices) for indices in blocks.values())
    log.info("employer_normalization_complete", total=total, blocks=len(blocks))
    return total
