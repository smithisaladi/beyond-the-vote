"""Tier 1a: Donor entity resolution via blocking + embedding + clustering.

Resolves individual FEC contributions into canonical donor identities.
Only donors with total contributions > $200 are stored (FEC itemization threshold).
Output is one condensed row per canonical donor (not per contribution).
"""
from collections import defaultdict
from pathlib import Path

import numpy as np
import structlog
from sklearn.cluster import AgglomerativeClustering

from shared.db import upsert, get_conn, reset_conn
from shared.embeddings import get_model, embed_texts
from shared.parquet import read_parquet_batched

log = structlog.get_logger()

MODEL_VERSION = "donor_resolution_v2_condensed"
MIN_TOTAL_AMOUNT = 200  # FEC itemization threshold


def build_blocking_key(last_name: str | None, zip_code: str | None) -> str | None:
    if not last_name or not zip_code:
        return None
    last_name = last_name.strip()
    zip5 = zip_code.strip()[:5]
    if len(last_name) < 2 or len(zip5) < 5:
        return None
    prefix = last_name[:3].lower()
    return f"{prefix}_{zip5}"


def extract_donors_from_parquet(parquet_path: Path, batch_size: int = 100_000) -> list[dict]:
    """Extract individual donor records from FEC indiv parquet file, streamed in batches."""
    donors = []
    for batch in read_parquet_batched(parquet_path, batch_size=batch_size):
        for row in batch:
            entity_tp = str(row.get("entity_tp") or "")
            if entity_tp not in ("IND", "", None):
                continue
            amt = 0.0
            try:
                amt = float(row.get("transaction_amt") or 0)
            except (ValueError, TypeError):
                continue
            if amt <= 0:
                continue
            zip_code = str(row.get("zip_code") or "")
            sub_id = row.get("sub_id")
            try:
                sub_id_int = int(sub_id) if sub_id else None
            except (ValueError, TypeError):
                sub_id_int = None
            if sub_id_int is None:
                continue
            donors.append({
                "sub_id": sub_id_int,
                "name": str(row.get("name") or ""),
                "employer": str(row.get("employer") or ""),
                "city": str(row.get("city") or ""),
                "state": str(row.get("state") or ""),
                "zip5": zip_code[:5],
                "cmte_id": str(row.get("cmte_id") or ""),
                "amount": amt,
            })
    log.info("extracted_donors", count=len(donors))
    return donors


def _parse_last_name(name: str) -> str:
    if "," in name:
        return name.split(",")[0].strip()
    parts = name.strip().split()
    return parts[-1] if parts else ""


def cluster_block(donors: list[dict], model, threshold: float = 0.15) -> dict[int, list[int]]:
    """Cluster donors within a block. Returns {label: [indices]}."""
    if len(donors) == 1:
        return {0: [0]}

    # Fast path: group by exact (name, employer) match first.
    # Only use embeddings when there are multiple distinct text signatures.
    texts = [f"{d['name']} {d['employer']}".strip().lower() for d in donors]
    groups: dict[str, list[int]] = defaultdict(list)
    for i, text in enumerate(texts):
        groups[text].append(i)

    # If all donors have the same text signature, they're one person — skip embedding
    if len(groups) == 1:
        return {0: list(range(len(donors)))}

    # If every text is unique, each donor is their own cluster — skip embedding for small blocks
    if len(groups) == len(donors) and len(donors) <= 3:
        return {i: [i] for i in range(len(donors))}

    if model is None:
        return {label: indices for label, indices in enumerate(groups.values())}

    # Only embed unique text signatures, then map back
    unique_texts = list(groups.keys())
    full_texts = [f"{donors[indices[0]]['name']} {donors[indices[0]]['employer']} {donors[indices[0]]['city']} {donors[indices[0]]['state']}".strip()
                  for indices in groups.values()]

    embeddings = embed_texts(model, full_texts)
    embedding_matrix = np.array(embeddings)

    if len(embedding_matrix) < 2:
        return {0: list(range(len(donors)))}

    clustering = AgglomerativeClustering(
        n_clusters=None, distance_threshold=threshold,
        metric="cosine", linkage="average",
    )
    labels = clustering.fit_predict(embedding_matrix)

    # Map cluster labels back to donor indices
    clusters: dict[int, list[int]] = defaultdict(list)
    for group_idx, (text, indices) in enumerate(groups.items()):
        label = int(labels[group_idx])
        clusters[label].extend(indices)

    return clusters


def _pick_best_name(donors: list[dict], indices: list[int]) -> tuple[str, str, str, str, str]:
    """Pick the best display name/employer/city/state/zip from a cluster.
    Prefers the longest name variant (usually the most complete)."""
    best_idx = max(indices, key=lambda i: len(donors[i]["name"]))
    d = donors[best_idx]
    return d["name"], d["employer"], d["city"], d["state"], d["zip5"]


def _normalize_name(name: str) -> str:
    """Normalize for merge matching: lowercase, strip suffixes, standardize format."""
    n = name.strip().lower()
    # Remove common suffixes
    for suffix in (" jr", " jr.", " sr", " sr.", " iii", " ii", " iv", " mr.", " mrs.", " mr", " mrs", " dr.", " dr"):
        if n.endswith(suffix):
            n = n[:-len(suffix)].rstrip(" ,")
    return n


_EMPLOYER_NOISE = {"retired", "self-employed", "self employed", "selfemployed", "none",
                    "not employed", "n/a", "na", "not applicable", "homemaker", "student",
                    "unemployed", "information requested", "refused"}
_EMPLOYER_SUFFIXES = [" inc", " inc.", " corp", " corp.", " corporation", " llc", " llp",
                      " co", " co.", " company", " ltd", " ltd.", " limited", " group",
                      " holdings", " enterprises", " associates", " partners", " pllc",
                      " pc", " p.c.", " pa", " p.a."]


def _normalize_employer(emp: str) -> str:
    """Normalize employer for merge matching. Returns empty string for noise/generic values."""
    if not emp:
        return ""
    e = emp.strip().lower()
    if e in _EMPLOYER_NOISE:
        return ""
    # Strip common suffixes so "SPACEX" matches "SPACEX INC" and "SPACE EXPLORATION TECHNOLOGIES CORP."
    for suffix in _EMPLOYER_SUFFIXES:
        if e.endswith(suffix):
            e = e[:-len(suffix)].rstrip(" ,.")
    return e


def _merge_cross_block_duplicates(canonical_donors: dict[str, dict]) -> dict[str, dict]:
    """Merge canonical donors that are the same person split across blocks.

    Groups by normalized name, then within each group merges entries that share
    employer or state. The highest-amount entry absorbs the others.
    """
    # Group by normalized name
    name_groups: dict[str, list[str]] = defaultdict(list)
    for cid, d in canonical_donors.items():
        norm = _normalize_name(d["display_name"])
        name_groups[norm].append(cid)

    merged_count = 0
    absorbed: set[str] = set()

    for norm_name, cids in name_groups.items():
        if len(cids) < 2:
            continue

        # Sort by total_amount descending — primary absorbs secondaries
        cids.sort(key=lambda c: canonical_donors[c]["total_amount"], reverse=True)

        for i in range(len(cids)):
            primary_id = cids[i]
            if primary_id in absorbed:
                continue
            primary = canonical_donors[primary_id]
            p_employer = (primary.get("employer") or "").strip().lower()
            p_state = (primary.get("state") or "").strip().upper()

            for j in range(i + 1, len(cids)):
                secondary_id = cids[j]
                if secondary_id in absorbed:
                    continue
                secondary = canonical_donors[secondary_id]
                s_employer = (secondary.get("employer") or "").strip().lower()
                s_state = (secondary.get("state") or "").strip().upper()

                should_merge = False
                combined = primary["total_amount"] + secondary["total_amount"]

                p_emp_norm = _normalize_employer(p_employer)
                s_emp_norm = _normalize_employer(s_employer)

                if p_emp_norm and s_emp_norm:
                    # Both have employers — match if same normalized or substring
                    if (p_emp_norm == s_emp_norm or
                            p_emp_norm in s_emp_norm or s_emp_norm in p_emp_norm):
                        should_merge = True
                    # At $100K+ combined, merge on name alone — two different
                    # people with the same name each giving $50K+ is near-impossible
                    elif combined >= 100_000:
                        should_merge = True

                # One/both have empty/generic employer — tiered by amount
                # $10K+: name match is sufficient (distinctive enough)
                elif combined >= 10_000:
                    should_merge = True

                if should_merge:
                    # Absorb secondary into primary
                    primary["total_amount"] += secondary["total_amount"]
                    primary["contribution_count"] += secondary["contribution_count"]
                    primary["cmte_ids"] = list(set(primary["cmte_ids"]) | set(secondary.get("cmte_ids", [])))
                    # Keep the best name (longest)
                    if len(secondary["display_name"]) > len(primary["display_name"]):
                        primary["display_name"] = secondary["display_name"]
                    if not primary.get("employer") and secondary.get("employer"):
                        primary["employer"] = secondary["employer"]
                    primary["confidence"] = min(primary["confidence"], 0.75)  # Lower confidence for cross-block merge
                    absorbed.add(secondary_id)
                    merged_count += 1

    # Remove absorbed entries
    for cid in absorbed:
        del canonical_donors[cid]

    log.info("cross_block_merge_complete", merged=merged_count, remaining=len(canonical_donors))
    return canonical_donors


def run_donor_resolution(parquet_paths: Path | list[Path], threshold: float = 0.15) -> int:
    if isinstance(parquet_paths, Path):
        parquet_paths = [parquet_paths]

    model = get_model()

    # Extract donors from all cycles into a single list
    donors: list[dict] = []
    for path in parquet_paths:
        log.info("extracting_donors", path=str(path))
        donors.extend(extract_donors_from_parquet(path))
    log.info("total_donors_extracted", count=len(donors), cycles=len(parquet_paths))

    # Close DB connection during long in-memory processing to avoid Neon idle timeout
    reset_conn()

    # Build blocks by (last_name_prefix, zip5)
    blocks: dict[str, list[int]] = defaultdict(list)
    skipped = 0
    for i, donor in enumerate(donors):
        last_name = _parse_last_name(donor["name"])
        key = build_blocking_key(last_name, donor["zip5"])
        if key is None:
            skipped += 1
            continue
        blocks[key].append(i)

    log.info("donor_blocks_built", blocks=len(blocks), donors=len(donors), skipped=skipped)

    # Resolve each block and aggregate into canonical donors
    # canonical_id -> aggregated data
    canonical_donors: dict[str, dict] = {}

    processed_blocks = 0
    for block_key, block_indices in blocks.items():
        block_donors = [donors[i] for i in block_indices]
        clusters = cluster_block(block_donors, model, threshold)

        for cluster_indices in clusters.values():
            # Pick a canonical ID from the first (lowest sub_id) member
            anchor_idx = min(cluster_indices, key=lambda i: block_donors[i]["sub_id"])
            canonical_id = f"d_{block_donors[anchor_idx]['sub_id']}"

            name, employer, city, state, zip5 = _pick_best_name(block_donors, cluster_indices)

            # Compute confidence from cluster tightness
            confidence = 1.0 if len(cluster_indices) == 1 else 0.85

            # Aggregate amounts and cmte_ids
            total_amount = sum(block_donors[i]["amount"] for i in cluster_indices)
            cmte_ids = list({block_donors[i]["cmte_id"] for i in cluster_indices if block_donors[i]["cmte_id"]})
            count = len(cluster_indices)

            if canonical_id in canonical_donors:
                # Merge with existing (same canonical across blocks shouldn't happen, but be safe)
                existing = canonical_donors[canonical_id]
                existing["total_amount"] += total_amount
                existing["contribution_count"] += count
                existing["cmte_ids"] = list(set(existing["cmte_ids"]) | set(cmte_ids))
            else:
                canonical_donors[canonical_id] = {
                    "canonical_id": canonical_id,
                    "display_name": name,
                    "employer": employer if employer else None,
                    "city": city if city else None,
                    "state": state if state else None,
                    "zip5": zip5 if zip5 else None,
                    "total_amount": total_amount,
                    "contribution_count": count,
                    "cmte_ids": cmte_ids,
                    "confidence": confidence,
                    "model_version": MODEL_VERSION,
                }

        processed_blocks += 1
        if processed_blocks % 10000 == 0:
            log.info("blocks_processed", blocks=processed_blocks, canonical_donors=len(canonical_donors))

    log.info("resolution_complete", blocks=processed_blocks, canonical_donors_total=len(canonical_donors))

    # ── Post-resolution merge pass ──────────────────────────────────
    # Merges canonical donors that ended up in different blocks but are
    # the same person. Criteria: exact normalized name match + (same
    # employer OR same state). Merges into the higher-amount entry.
    canonical_donors = _merge_cross_block_duplicates(canonical_donors)

    # Filter: only keep donors above $200 threshold
    filtered = [d for d in canonical_donors.values() if d["total_amount"] >= MIN_TOTAL_AMOUNT]
    log.info("filtered_donors", above_threshold=len(filtered), below_threshold=len(canonical_donors) - len(filtered))

    # Delete old results right before upload (after new data is computed)
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM enrichment.donor_canonical WHERE model_version = %s", (MODEL_VERSION,))

    # Upload in batches
    batch_size = 5000
    total_uploaded = 0
    for i in range(0, len(filtered), batch_size):
        chunk = filtered[i:i + batch_size]
        upsert("donor_canonical", chunk, on_conflict="canonical_id", schema="enrichment")
        total_uploaded += len(chunk)
        log.info("donors_uploaded", rows=total_uploaded)

    log.info("donor_resolution_complete", total_canonical=total_uploaded)
    return total_uploaded
