"""Industry classification via embedding similarity to OpenSecrets employers.

For employers that don't exact-match in the org_to_industry.tsv lookup,
embed them and find the nearest known employer via cosine similarity.
Assign the matched employer's CRP industry code.

Approach:
1. Build an embedding index of all 769K OpenSecrets employer names
2. For each unmatched employer, find the nearest neighbor
3. If similarity > threshold, assign that industry
"""
import numpy as np
import structlog
from pathlib import Path

from shared.db import upsert, get_supabase, get_conn
from shared.embeddings import get_model, embed_texts

log = structlog.get_logger()

MODEL_VERSION = "industry_opensecrets_v3_embeddings"

# Only re-classify employers below this confidence from previous run
RECLASSIFY_THRESHOLD = 0.5
# Minimum cosine similarity to accept an embedding match
MATCH_THRESHOLD = 0.75


def build_opensecrets_index(
    data_dir: Path,
    crp_categories: dict[str, dict],
    sample_size: int = 100_000,
) -> tuple[np.ndarray, list[str], list[str]]:
    """Build an embedding index from the most common OpenSecrets employers.

    Returns: (embedding_matrix, employer_names, industry_labels)
    """
    from enrich.opensecrets import load_org_lookup

    org_lookup = load_org_lookup(data_dir)
    if not org_lookup:
        return np.array([]), [], []

    # Take top N by frequency (the lookup is sorted alphabetically, so sample diversely)
    # For efficiency, take a representative sample rather than all 769K
    import random
    random.seed(42)
    all_orgs = list(org_lookup.items())
    if len(all_orgs) > sample_size:
        sampled = random.sample(all_orgs, sample_size)
    else:
        sampled = all_orgs

    names = []
    industries = []
    for org_name, catcode in sampled:
        cat = crp_categories.get(catcode)
        sector = cat["sector"] if cat else "Other"
        if sector in ("Other", "Unknown"):
            continue
        names.append(org_name)
        industries.append(sector)

    log.info("building_opensecrets_index", employers=len(names))

    model = get_model()
    # Embed in batches
    embeddings = embed_texts(model, names, batch_size=512)
    matrix = np.array(embeddings, dtype=np.float32)

    # Normalize for cosine similarity
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1
    matrix = matrix / norms

    log.info("opensecrets_index_built", shape=matrix.shape)
    return matrix, names, industries


def classify_by_embedding(
    employer_names: list[str],
    index_matrix: np.ndarray,
    index_industries: list[str],
    threshold: float = MATCH_THRESHOLD,
    batch_size: int = 1000,
) -> list[tuple[str, float]]:
    """Classify employers by nearest-neighbor embedding similarity.

    Returns: list of (industry, confidence) tuples
    """
    model = get_model()
    results = []

    for i in range(0, len(employer_names), batch_size):
        batch = employer_names[i:i + batch_size]
        embeddings = np.array(embed_texts(model, batch), dtype=np.float32)

        # Normalize
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms[norms == 0] = 1
        embeddings = embeddings / norms

        # Cosine similarity (dot product of normalized vectors)
        similarities = embeddings @ index_matrix.T  # (batch, index_size)
        best_idx = similarities.argmax(axis=1)
        best_sim = similarities[np.arange(len(batch)), best_idx]

        for j, (idx, sim) in enumerate(zip(best_idx, best_sim)):
            sim_f = float(sim)
            if sim_f >= threshold:
                results.append((index_industries[idx], round(sim_f, 3)))
            else:
                results.append(("Other", round(sim_f, 3)))

        if (i + batch_size) % 10000 == 0 or i + batch_size >= len(employer_names):
            log.info("embedding_classification_progress",
                     done=min(i + batch_size, len(employer_names)),
                     total=len(employer_names))

    return results


def run_industry_classification_ml(data_dir: Path) -> int:
    """Re-classify low-confidence employers using embedding similarity."""
    from enrich.opensecrets import load_crp_categories

    crp_categories = load_crp_categories(data_dir)

    # Build index from OpenSecrets known employers
    index_matrix, index_names, index_industries = build_opensecrets_index(
        data_dir, crp_categories, sample_size=100_000
    )

    if index_matrix.size == 0:
        log.warning("no_opensecrets_index")
        return 0

    # Get employers currently classified as "Other" or low confidence
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT ei.canonical_employer_id, ec.canonical_name
        FROM enrichment.employer_industry ei
        JOIN enrichment.employer_canonical ec ON ec.canonical_employer_id = ei.canonical_employer_id
        WHERE ei.confidence < %s
        GROUP BY ei.canonical_employer_id, ec.canonical_name
    """, (RECLASSIFY_THRESHOLD,))

    rows = cur.fetchall()
    if not rows:
        log.info("no_employers_to_reclassify")
        return 0

    emp_ids = [r[0] for r in rows]
    emp_names = [r[1] for r in rows]

    log.info("reclassifying_employers", count=len(emp_names))

    # Classify via embedding similarity
    classifications = classify_by_embedding(
        emp_names, index_matrix, index_industries
    )

    # Update only those that improved
    updates = []
    improved = 0
    for emp_id, (industry, confidence) in zip(emp_ids, classifications):
        if industry != "Other" and confidence >= MATCH_THRESHOLD:
            updates.append({
                "canonical_employer_id": emp_id,
                "industry": industry,
                "confidence": confidence,
                "model_version": MODEL_VERSION,
            })
            improved += 1

    if updates:
        # Delete old classifications for these employers and insert new
        for i in range(0, len(updates), 500):
            chunk = updates[i:i + 500]
            ids = [u["canonical_employer_id"] for u in chunk]
            placeholders = ",".join(["%s"] * len(ids))
            cur.execute(f"DELETE FROM enrichment.employer_industry WHERE canonical_employer_id IN ({placeholders})", ids)
        upsert("employer_industry", updates, schema="enrichment")

    log.info("ml_reclassification_complete",
             total=len(emp_names), improved=improved,
             improvement_rate=round(improved / max(len(emp_names), 1), 3))
    return improved
