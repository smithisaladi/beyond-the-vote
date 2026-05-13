# Phase 2: ML Tier 1 — Data Cleaning & Enrichment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean FEC individual contribution data via donor entity resolution, employer normalization, industry classification, and address standardization — all running locally against Parquet files, uploading enriched results to Supabase.

**Architecture:** Each enrichment step reads from local FEC Parquet files (individual contributions at `pipeline/data/fec/{cycle}/indiv.parquet`), processes using sentence-transformers embeddings + clustering (HDBSCAN/agglomerative), and uploads results to the `enrichment.*` schema in Supabase. All ML runs locally on CPU. The shared `embeddings.py` module (already built) provides the MiniLM model. A new `pipeline/enrich/` package houses one module per enrichment step.

**Tech Stack:** sentence-transformers (all-MiniLM-L6-v2), scikit-learn (AgglomerativeClustering), hdbscan, usaddress, DuckDB, Supabase, structlog

**Design spec:** `docs/superpowers/specs/2026-05-10-full-stack-refactor-design.md` (Section 9, Tier 1)

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `pipeline/enrich/donor_resolution.py` | Tier 1a: blocking + embedding + agglomerative clustering |
| Create | `pipeline/enrich/employer_normalization.py` | Tier 1b: embed unique employers + HDBSCAN clustering |
| Create | `pipeline/enrich/industry_classification.py` | Tier 1c: batch LLM classification of canonical employers |
| Create | `pipeline/enrich/address_standardization.py` | Tier 1d: usaddress parsing + Census geocoding |
| Create | `pipeline/enrich/stopwords.py` | Shared employer stopword list |
| Create | `pipeline/scripts/enrich_tier1.py` | Orchestrator for all Tier 1 steps |
| Create | `pipeline/tests/test_donor_resolution.py` | Unit tests |
| Create | `pipeline/tests/test_employer_normalization.py` | Unit tests |
| Create | `pipeline/tests/test_industry_classification.py` | Unit tests |
| Create | `pipeline/tests/test_address_standardization.py` | Unit tests |

---

## Task 1: Employer stopwords module

**Files:**
- Create: `pipeline/enrich/stopwords.py`
- Create: `pipeline/tests/test_stopwords.py`

- [ ] **Step 1: Write test**

```python
# pipeline/tests/test_stopwords.py
from pipeline.enrich.stopwords import is_non_employer, normalize_employer_string


def test_retired_is_non_employer():
    assert is_non_employer("RETIRED") is True
    assert is_non_employer("retired") is True
    assert is_non_employer("Retired") is True


def test_self_employed_is_non_employer():
    assert is_non_employer("SELF-EMPLOYED") is True
    assert is_non_employer("SELF EMPLOYED") is True
    assert is_non_employer("Self") is True


def test_not_employed_is_non_employer():
    assert is_non_employer("NOT EMPLOYED") is True
    assert is_non_employer("N/A") is True
    assert is_non_employer("NONE") is True
    assert is_non_employer("") is True


def test_real_employer_is_not_non_employer():
    assert is_non_employer("Goldman Sachs") is False
    assert is_non_employer("Google LLC") is False
    assert is_non_employer("US Army") is False


def test_normalize_employer_string():
    assert normalize_employer_string("  GOLDMAN SACHS & CO.  ") == "goldman sachs & co."
    assert normalize_employer_string("Goldman  Sachs   Group") == "goldman sachs group"
    assert normalize_employer_string(None) == ""
    assert normalize_employer_string("") == ""
```

- [ ] **Step 2: Implement stopwords module**

```python
# pipeline/enrich/stopwords.py
"""Employer stopword detection and normalization."""
import re

_NON_EMPLOYERS = {
    "retired", "self-employed", "self employed", "self", "not employed",
    "none", "n/a", "na", "homemaker", "student", "unemployed",
    "not applicable", "information requested", "information requested per best efforts",
    "refused", "disabled", "volunteer",
}


def is_non_employer(employer: str | None) -> bool:
    """Return True if the employer string is a non-employer (retired, self-employed, etc.)."""
    if not employer:
        return True
    normalized = employer.strip().lower()
    if not normalized:
        return True
    return normalized in _NON_EMPLOYERS


def normalize_employer_string(employer: str | None) -> str:
    """Lowercase, strip whitespace, collapse multiple spaces."""
    if not employer:
        return ""
    return re.sub(r"\s+", " ", employer.strip().lower())
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/smithi/Desktop/beyond-the-vote/pipeline && uv run pytest tests/test_stopwords.py -v
```

Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add pipeline/enrich/stopwords.py pipeline/tests/test_stopwords.py
git commit -m "feat(pipeline): employer stopword detection and normalization"
```

---

## Task 2: Donor entity resolution (Tier 1a)

**Files:**
- Create: `pipeline/enrich/donor_resolution.py`
- Create: `pipeline/tests/test_donor_resolution.py`

- [ ] **Step 1: Write tests**

```python
# pipeline/tests/test_donor_resolution.py
from pipeline.enrich.donor_resolution import (
    build_blocking_key,
    extract_donors_from_parquet,
    cluster_block,
)


def test_build_blocking_key():
    assert build_blocking_key("SMITH", "10001") == "smi_10001"
    assert build_blocking_key("O'Brien", "90210") == "o'b_90210"
    assert build_blocking_key("Li", "00000") == "li_00000"


def test_build_blocking_key_missing_fields():
    assert build_blocking_key("", "10001") is None
    assert build_blocking_key("Smith", "") is None
    assert build_blocking_key(None, None) is None


def test_extract_donors_from_parquet_returns_dicts(tmp_path):
    """Create a small parquet file and extract donors."""
    import duckdb

    parquet_path = tmp_path / "test_indiv.parquet"
    conn = duckdb.connect(":memory:")
    conn.execute("""
        CREATE TABLE donors AS SELECT
            'C00123456' as cmte_id, '' as amndt_ind, '' as rpt_tp,
            '' as transaction_pgi, '' as image_num, '15' as transaction_tp,
            'IND' as entity_tp, 'SMITH, JOHN' as name,
            'NEW YORK' as city, 'NY' as state, '10001' as zip_code,
            'GOLDMAN SACHS' as employer, 'BANKER' as occupation,
            '01152025' as transaction_dt, '500' as transaction_amt,
            '' as other_id, '' as tran_id, '' as file_num,
            '' as memo_cd, '' as memo_text, '1001' as sub_id
    """)
    conn.execute(f"COPY donors TO '{parquet_path}' (FORMAT PARQUET)")
    conn.close()

    donors = extract_donors_from_parquet(parquet_path)
    assert len(donors) == 1
    assert donors[0]["name"] == "SMITH, JOHN"
    assert donors[0]["employer"] == "GOLDMAN SACHS"
    assert donors[0]["zip5"] == "10001"
    assert donors[0]["sub_id"] == 1001


def test_cluster_block_single_donor():
    """A single donor in a block should get its own canonical_id."""
    donors = [
        {"sub_id": 1, "name": "SMITH, JOHN", "employer": "GOLDMAN SACHS",
         "address": "123 MAIN ST NEW YORK NY 10001", "zip5": "10001"},
    ]
    results = cluster_block(donors, model=None, threshold=0.15)
    assert len(results) == 1
    assert results[0]["canonical_id"] is not None
    assert results[0]["confidence"] == 1.0


def test_cluster_block_identical_donors_same_cluster():
    """Identical donors should be assigned the same canonical_id."""
    donors = [
        {"sub_id": 1, "name": "SMITH, JOHN", "employer": "GOLDMAN SACHS",
         "address": "123 MAIN ST NEW YORK NY", "zip5": "10001"},
        {"sub_id": 2, "name": "SMITH, JOHN", "employer": "GOLDMAN SACHS",
         "address": "123 MAIN ST NEW YORK NY", "zip5": "10001"},
    ]
    results = cluster_block(donors, model=None, threshold=0.15)
    assert len(results) == 2
    assert results[0]["canonical_id"] == results[1]["canonical_id"]
```

- [ ] **Step 2: Implement donor resolution**

```python
# pipeline/enrich/donor_resolution.py
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
    """Build a blocking key from (first 3 chars of last_name, zip5)."""
    if not last_name or not zip_code:
        return None
    last_name = last_name.strip()
    zip5 = zip_code.strip()[:5]
    if len(last_name) < 2 or len(zip5) < 5:
        return None
    prefix = last_name[:3].lower()
    return f"{prefix}_{zip5}"


def extract_donors_from_parquet(parquet_path: Path) -> list[dict]:
    """Extract individual donor records from a FEC indiv parquet file.

    Returns list of dicts with keys: sub_id, name, employer, occupation,
    city, state, zip5, address (concatenated).
    """
    with duckdb_connect() as conn:
        df = conn.execute(f"""
            SELECT
                CAST(sub_id AS BIGINT) as sub_id,
                name,
                employer,
                occupation,
                city,
                state,
                zip_code,
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
    """Extract last name from FEC 'LAST, FIRST' format."""
    if "," in name:
        return name.split(",")[0].strip()
    parts = name.strip().split()
    return parts[-1] if parts else ""


def cluster_block(
    donors: list[dict],
    model,
    threshold: float = 0.15,
) -> list[dict]:
    """Cluster donors within a single block. Returns enrichment rows."""
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

    # Build text for embedding: name + employer + address
    texts = [
        f"{d['name']} {d['employer']} {d['address']}".strip()
        for d in donors
    ]

    # If no model provided (testing), use string equality for clustering
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

    # Embed and cluster
    embeddings = embed_texts(model, texts)
    embedding_matrix = np.array(embeddings)

    clustering = AgglomerativeClustering(
        n_clusters=None,
        distance_threshold=threshold,
        metric="cosine",
        linkage="average",
    )
    labels = clustering.fit_predict(embedding_matrix)

    # Compute per-donor confidence as 1 - distance to cluster centroid
    centroids = {}
    for label in set(labels):
        mask = labels == label
        centroids[label] = embedding_matrix[mask].mean(axis=0)

    results = []
    for i, donor in enumerate(donors):
        label = labels[i]
        # Canonical ID: use the first sub_id in this cluster
        cluster_members = [j for j, l in enumerate(labels) if l == label]
        canonical_sub_id = donors[min(cluster_members)]["sub_id"]

        # Confidence: cosine similarity to centroid
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


def run_donor_resolution(
    parquet_path: Path,
    threshold: float = 0.15,
    block_batch_size: int = 10_000,
) -> int:
    """Run full donor entity resolution on a Parquet file. Returns rows uploaded."""
    model = get_model()
    donors = extract_donors_from_parquet(parquet_path)

    # Build blocks
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

    # Process blocks
    all_results = []
    processed_blocks = 0
    for block_key, block_donors in blocks.items():
        results = cluster_block(block_donors, model, threshold)
        all_results.extend(results)

        # Upload in batches
        if len(all_results) >= block_batch_size:
            upsert("donor_canonical", all_results, schema="enrichment")
            log.info("donor_batch_uploaded", rows=len(all_results), blocks=processed_blocks)
            all_results = []

        processed_blocks += 1

    # Upload remaining
    if all_results:
        upsert("donor_canonical", all_results, schema="enrichment")

    total = sum(len(block) for block in blocks.values())
    log.info("donor_resolution_complete", total_donors=total, blocks=len(blocks))
    return total
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/smithi/Desktop/beyond-the-vote/pipeline && uv run pytest tests/test_donor_resolution.py -v
```

Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add pipeline/enrich/donor_resolution.py pipeline/tests/test_donor_resolution.py
git commit -m "feat(pipeline): Tier 1a donor entity resolution"
```

---

## Task 3: Employer normalization (Tier 1b)

**Files:**
- Create: `pipeline/enrich/employer_normalization.py`
- Create: `pipeline/tests/test_employer_normalization.py`

- [ ] **Step 1: Write tests**

```python
# pipeline/tests/test_employer_normalization.py
from pipeline.enrich.employer_normalization import (
    extract_unique_employers,
    pick_canonical_name,
    cluster_employers,
)


def test_extract_unique_employers(tmp_path):
    """Extract unique employer strings from a parquet file."""
    import duckdb

    parquet_path = tmp_path / "test_indiv.parquet"
    conn = duckdb.connect(":memory:")
    conn.execute("""
        CREATE TABLE donors AS
        SELECT 'GOLDMAN SACHS' as employer UNION ALL
        SELECT 'Goldman Sachs & Co.' UNION ALL
        SELECT 'GOLDMAN SACHS' UNION ALL
        SELECT 'RETIRED' UNION ALL
        SELECT 'GOOGLE LLC'
    """)
    conn.execute(f"COPY donors TO '{parquet_path}' (FORMAT PARQUET)")
    conn.close()

    employers = extract_unique_employers(parquet_path)
    # Should exclude RETIRED (stopword) and deduplicate GOLDMAN SACHS
    assert "RETIRED" not in employers
    assert len(employers) == 3  # goldman sachs, goldman sachs & co., google llc


def test_pick_canonical_name():
    variants = ["GOLDMAN SACHS", "Goldman Sachs & Co.", "GS", "goldman sachs group inc"]
    canonical = pick_canonical_name(variants)
    # Should pick most common or shortest non-abbreviated
    assert canonical is not None
    assert len(canonical) > 2  # Not just "GS"


def test_cluster_employers_identical():
    employers = ["goldman sachs", "goldman sachs", "google llc"]
    clusters = cluster_employers(employers, model=None)
    # With no model, falls back to exact-match grouping
    assert len(clusters) == 2  # two distinct groups
```

- [ ] **Step 2: Implement employer normalization**

```python
# pipeline/enrich/employer_normalization.py
"""Tier 1b: Employer normalization via embedding + HDBSCAN clustering."""
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import structlog

from pipeline.shared.db import upsert
from pipeline.shared.embeddings import get_model, embed_texts
from pipeline.shared.parquet import duckdb_connect
from pipeline.enrich.stopwords import is_non_employer, normalize_employer_string

log = structlog.get_logger()

MODEL_VERSION = "employer_norm_v1_minilm_hdbscan"


def extract_unique_employers(parquet_path: Path) -> list[str]:
    """Extract unique non-stopword employer strings from individual contributions."""
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
    """Pick the best canonical name from a list of employer name variants.

    Prefers the most common variant. Ties broken by shortest non-abbreviated form.
    """
    if not variants:
        return ""
    if len(variants) == 1:
        return variants[0]

    counts = Counter(v.lower() for v in variants)
    # Group original-case variants by lowered form
    by_lower: dict[str, list[str]] = defaultdict(list)
    for v in variants:
        by_lower[v.lower()].append(v)

    # Sort by frequency (desc), then length (desc, prefer longer = less abbreviated)
    sorted_keys = sorted(counts.keys(), key=lambda k: (-counts[k], -len(k)))
    best_lower = sorted_keys[0]

    # From the best group, pick the version with most natural casing (mixed case preferred)
    candidates = by_lower[best_lower]
    for c in candidates:
        if c != c.upper() and c != c.lower():
            return c  # Mixed case
    return candidates[0]


def cluster_employers(
    employers: list[str],
    model,
    min_cluster_size: int = 2,
) -> list[list[int]]:
    """Cluster employer strings. Returns list of clusters (each is list of indices)."""
    if not employers:
        return []

    # Fallback for testing: exact-match grouping
    if model is None:
        groups: dict[str, list[int]] = defaultdict(list)
        for i, emp in enumerate(employers):
            groups[emp.lower()].append(i)
        return list(groups.values())

    # Embed all employers
    embeddings = embed_texts(model, employers)
    embedding_matrix = np.array(embeddings)

    # Use HDBSCAN for variable-size clusters
    import hdbscan

    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        metric="euclidean",
        cluster_selection_method="eom",
    )
    labels = clusterer.fit_predict(embedding_matrix)

    # Group indices by label (-1 = noise, each noise point is its own cluster)
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
    """Run full employer normalization. Returns rows uploaded."""
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
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/smithi/Desktop/beyond-the-vote/pipeline && uv run pytest tests/test_employer_normalization.py -v
```

Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add pipeline/enrich/employer_normalization.py pipeline/tests/test_employer_normalization.py
git commit -m "feat(pipeline): Tier 1b employer normalization via HDBSCAN"
```

---

## Task 4: Industry classification (Tier 1c)

**Files:**
- Create: `pipeline/enrich/industry_classification.py`
- Create: `pipeline/tests/test_industry_classification.py`

- [ ] **Step 1: Write tests**

```python
# pipeline/tests/test_industry_classification.py
from pipeline.enrich.industry_classification import (
    INDUSTRY_BUCKETS,
    build_classification_prompt,
    parse_classification_response,
    classify_employers_batch_local,
)


def test_industry_buckets_has_expected_count():
    assert len(INDUSTRY_BUCKETS) >= 15
    assert "Finance" in INDUSTRY_BUCKETS
    assert "Technology" in INDUSTRY_BUCKETS
    assert "Healthcare" in INDUSTRY_BUCKETS


def test_build_classification_prompt():
    prompt = build_classification_prompt(["Goldman Sachs", "Google LLC", "Pfizer Inc"])
    assert "Goldman Sachs" in prompt
    assert "Google LLC" in prompt
    assert "Finance" in prompt  # from INDUSTRY_BUCKETS


def test_parse_classification_response():
    response = """Goldman Sachs|Finance|0.95
Google LLC|Technology|0.92
Pfizer Inc|Healthcare|0.88"""
    results = parse_classification_response(response)
    assert len(results) == 3
    assert results[0]["employer"] == "Goldman Sachs"
    assert results[0]["industry"] == "Finance"
    assert results[0]["confidence"] == 0.95


def test_parse_classification_response_handles_bad_lines():
    response = """Goldman Sachs|Finance|0.95
bad line without pipes
Google LLC|Technology|0.92"""
    results = parse_classification_response(response)
    assert len(results) == 2  # bad line skipped


def test_classify_employers_batch_local():
    """Test the embedding-based local fallback classifier."""
    employers = ["Goldman Sachs", "JPMorgan Chase", "Google LLC"]
    results = classify_employers_batch_local(employers)
    assert len(results) == 3
    for r in results:
        assert r["industry"] in INDUSTRY_BUCKETS
        assert 0 <= r["confidence"] <= 1
```

- [ ] **Step 2: Implement industry classification**

```python
# pipeline/enrich/industry_classification.py
"""Tier 1c: Industry classification of canonical employers.

Supports two modes:
- LLM batch API (Anthropic/OpenAI) for high-quality classification
- Local embedding similarity fallback (free, lower quality)
"""
import os
from pathlib import Path

import numpy as np
import structlog

from pipeline.shared.db import upsert, get_supabase
from pipeline.shared.embeddings import get_model, embed_texts

log = structlog.get_logger()

MODEL_VERSION = "industry_class_v1"

INDUSTRY_BUCKETS = [
    "Finance",
    "Technology",
    "Healthcare",
    "Energy",
    "Real Estate",
    "Legal",
    "Defense",
    "Education",
    "Agriculture",
    "Transportation",
    "Media & Entertainment",
    "Retail & Consumer",
    "Manufacturing",
    "Hospitality",
    "Telecom",
    "Construction",
    "Insurance",
    "Pharma & Biotech",
    "Government",
    "Nonprofit",
    "Other",
]

# Representative employers per industry for embedding-based classification
_INDUSTRY_EXEMPLARS = {
    "Finance": ["Goldman Sachs", "JPMorgan Chase", "Bank of America", "Morgan Stanley", "Citigroup"],
    "Technology": ["Google", "Microsoft", "Apple", "Amazon", "Meta", "Salesforce"],
    "Healthcare": ["Kaiser Permanente", "UnitedHealth Group", "Mayo Clinic", "HCA Healthcare"],
    "Energy": ["ExxonMobil", "Chevron", "Shell", "BP", "ConocoPhillips", "NextEra Energy"],
    "Real Estate": ["CBRE Group", "Jones Lang LaSalle", "Cushman & Wakefield", "Zillow"],
    "Legal": ["Kirkland & Ellis", "Latham & Watkins", "DLA Piper", "Skadden Arps"],
    "Defense": ["Lockheed Martin", "Raytheon", "Boeing Defense", "Northrop Grumman", "General Dynamics"],
    "Education": ["Harvard University", "Stanford University", "University of Michigan"],
    "Agriculture": ["Cargill", "Archer Daniels Midland", "Deere & Company", "Monsanto"],
    "Transportation": ["FedEx", "UPS", "Delta Air Lines", "Union Pacific", "CSX"],
    "Media & Entertainment": ["Walt Disney", "Comcast NBCUniversal", "Warner Bros", "Netflix"],
    "Retail & Consumer": ["Walmart", "Target", "Costco", "Home Depot", "Procter & Gamble"],
    "Manufacturing": ["General Electric", "3M", "Caterpillar", "Honeywell", "Siemens"],
    "Hospitality": ["Marriott", "Hilton", "McDonald's", "Starbucks", "Yum! Brands"],
    "Telecom": ["AT&T", "Verizon", "T-Mobile", "Comcast"],
    "Construction": ["Bechtel", "Fluor", "Turner Construction", "Jacobs Engineering"],
    "Insurance": ["Berkshire Hathaway", "AIG", "MetLife", "Prudential Financial"],
    "Pharma & Biotech": ["Pfizer", "Johnson & Johnson", "Merck", "AbbVie", "Amgen"],
    "Government": ["US Government", "Department of Defense", "State Department"],
    "Nonprofit": ["Red Cross", "United Way", "Salvation Army", "Habitat for Humanity"],
    "Other": [],
}


def build_classification_prompt(employers: list[str]) -> str:
    """Build a prompt for LLM batch classification."""
    industries_list = "\n".join(f"- {b}" for b in INDUSTRY_BUCKETS)
    employers_list = "\n".join(employers)

    return f"""Classify each employer into exactly one industry. Industries:
{industries_list}

For each employer, respond with one line: employer_name|industry|confidence (0.0-1.0)

Employers:
{employers_list}"""


def parse_classification_response(response: str) -> list[dict]:
    """Parse LLM classification response into structured results."""
    results = []
    for line in response.strip().split("\n"):
        parts = line.split("|")
        if len(parts) != 3:
            continue
        employer = parts[0].strip()
        industry = parts[1].strip()
        try:
            confidence = float(parts[2].strip())
        except ValueError:
            confidence = 0.5
        if industry not in INDUSTRY_BUCKETS:
            industry = "Other"
            confidence = min(confidence, 0.3)
        results.append({
            "employer": employer,
            "industry": industry,
            "confidence": confidence,
        })
    return results


def classify_employers_batch_local(employers: list[str]) -> list[dict]:
    """Classify employers using local embedding similarity to industry exemplars.

    Free alternative to LLM batch API. Lower quality but zero cost.
    """
    model = get_model()

    # Embed all employers
    employer_embeddings = np.array(embed_texts(model, employers))

    # Embed industry exemplars and compute mean per industry
    industry_centroids = {}
    for industry, exemplars in _INDUSTRY_EXEMPLARS.items():
        if not exemplars:
            continue
        embs = np.array(embed_texts(model, exemplars))
        industry_centroids[industry] = embs.mean(axis=0)

    industry_names = list(industry_centroids.keys())
    centroid_matrix = np.array([industry_centroids[n] for n in industry_names])

    # Cosine similarity: employers x industries
    employer_norms = np.linalg.norm(employer_embeddings, axis=1, keepdims=True) + 1e-8
    centroid_norms = np.linalg.norm(centroid_matrix, axis=1, keepdims=True) + 1e-8
    similarities = (employer_embeddings / employer_norms) @ (centroid_matrix / centroid_norms).T

    results = []
    for i, employer in enumerate(employers):
        best_idx = int(np.argmax(similarities[i]))
        confidence = float(similarities[i][best_idx])
        industry = industry_names[best_idx]

        # Low confidence → "Other"
        if confidence < 0.3:
            industry = "Other"

        results.append({
            "employer": employer,
            "industry": industry,
            "confidence": round(confidence, 3),
        })

    return results


def run_industry_classification(use_llm: bool = False) -> int:
    """Classify canonical employers by industry. Returns rows uploaded.

    Args:
        use_llm: If True, use Anthropic batch API. If False, use local embeddings.
    """
    client = get_supabase()

    # Get canonical employers that don't have an industry classification yet
    result = client.schema("enrichment").table("employer_canonical").select(
        "canonical_employer_id, canonical_name"
    ).execute()

    if not result.data:
        log.warning("no_employers_to_classify")
        return 0

    # Deduplicate by canonical_employer_id
    seen = set()
    employers_to_classify = []
    for row in result.data:
        if row["canonical_employer_id"] not in seen:
            seen.add(row["canonical_employer_id"])
            employers_to_classify.append(row)

    # Check which already have classifications
    existing = client.schema("enrichment").table("employer_industry").select(
        "canonical_employer_id"
    ).execute()
    existing_ids = {r["canonical_employer_id"] for r in existing.data}

    to_classify = [e for e in employers_to_classify if e["canonical_employer_id"] not in existing_ids]
    log.info("employers_to_classify", total=len(to_classify), already_classified=len(existing_ids))

    if not to_classify:
        return 0

    names = [e["canonical_name"] for e in to_classify]

    if use_llm:
        # LLM batch classification (requires ANTHROPIC_API_KEY)
        log.info("using_llm_classification")
        # Process in batches of 100 for the API
        all_results = []
        for i in range(0, len(names), 100):
            batch_names = names[i:i + 100]
            prompt = build_classification_prompt(batch_names)
            # Call Anthropic API
            import anthropic
            api_key = os.environ["ANTHROPIC_API_KEY"]
            client_ai = anthropic.Anthropic(api_key=api_key)
            response = client_ai.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
            parsed = parse_classification_response(response.content[0].text)
            all_results.extend(parsed)
    else:
        # Local embedding-based classification
        log.info("using_local_classification")
        all_results = classify_employers_batch_local(names)

    # Build upload rows
    rows = []
    for emp_data, classification in zip(to_classify, all_results):
        rows.append({
            "canonical_employer_id": emp_data["canonical_employer_id"],
            "industry": classification["industry"],
            "confidence": classification["confidence"],
            "model_version": MODEL_VERSION + ("_llm" if use_llm else "_local"),
        })

    total = upsert("employer_industry", rows, schema="enrichment")
    log.info("industry_classification_complete", rows=total)
    return total
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/smithi/Desktop/beyond-the-vote/pipeline && uv run pytest tests/test_industry_classification.py -v
```

Expected: All PASS (the local classifier test will take ~10s due to embedding computation)

- [ ] **Step 4: Commit**

```bash
git add pipeline/enrich/industry_classification.py pipeline/tests/test_industry_classification.py
git commit -m "feat(pipeline): Tier 1c industry classification with LLM and local fallback"
```

---

## Task 5: Address standardization (Tier 1d)

**Files:**
- Create: `pipeline/enrich/address_standardization.py`
- Create: `pipeline/tests/test_address_standardization.py`

- [ ] **Step 1: Write tests**

```python
# pipeline/tests/test_address_standardization.py
from pipeline.enrich.address_standardization import (
    parse_address,
    normalize_address,
    batch_geocode,
)


def test_parse_address_basic():
    result = parse_address("123 Main St New York NY 10001")
    assert result is not None
    assert result["street"] == "123 Main St"
    assert result["city"] == "New York"
    assert result["state"] == "NY"
    assert result["zip5"] == "10001"


def test_parse_address_partial():
    result = parse_address("New York NY 10001")
    assert result is not None
    assert result["state"] == "NY"
    assert result["zip5"] == "10001"


def test_parse_address_empty():
    result = parse_address("")
    assert result is not None
    assert result["street"] == ""


def test_normalize_address():
    row = {
        "name": "SMITH, JOHN",
        "city": "NEW YORK",
        "state": "NY",
        "zip_code": "100011234",
        "sub_id": 12345,
    }
    result = normalize_address(row)
    assert result["city"] == "NEW YORK"
    assert result["state"] == "NY"
    assert result["zip5"] == "10001"
    assert result["zip4"] == "1234"
    assert result["contribution_id"] == 12345


def test_batch_geocode_returns_empty_for_empty_input():
    results = batch_geocode([])
    assert results == []
```

- [ ] **Step 2: Implement address standardization**

```python
# pipeline/enrich/address_standardization.py
"""Tier 1d: Address standardization + geocoding."""
import time
from pathlib import Path

import httpx
import structlog

from pipeline.shared.db import upsert
from pipeline.shared.parquet import duckdb_connect

log = structlog.get_logger()

MODEL_VERSION = "address_std_v1_usaddress"

# Census geocoder batch endpoint (free, no API key required)
CENSUS_GEOCODE_URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"


def parse_address(address_str: str) -> dict:
    """Parse an address string using usaddress. Returns structured components."""
    result = {"street": "", "city": "", "state": "", "zip5": "", "zip4": ""}

    if not address_str or not address_str.strip():
        return result

    try:
        import usaddress
        tagged, addr_type = usaddress.tag(address_str)

        street_parts = []
        for key in ["AddressNumber", "StreetNamePreDirectional", "StreetName",
                     "StreetNamePostType", "StreetNamePostDirectional",
                     "OccupancyType", "OccupancyIdentifier"]:
            if key in tagged:
                street_parts.append(tagged[key])

        result["street"] = " ".join(street_parts)
        result["city"] = tagged.get("PlaceName", "")
        result["state"] = tagged.get("StateName", "")

        zip_code = tagged.get("ZipCode", "")
        if zip_code:
            result["zip5"] = zip_code[:5]
            if len(zip_code) > 5:
                result["zip4"] = zip_code[5:9].lstrip("-")

    except Exception:
        # usaddress can raise on malformed addresses — fall through to raw extraction
        pass

    return result


def normalize_address(row: dict) -> dict:
    """Normalize a donor record's address fields. Returns enrichment row."""
    zip_code = str(row.get("zip_code") or "").strip()
    zip5 = zip_code[:5] if len(zip_code) >= 5 else zip_code
    zip4 = zip_code[5:9].lstrip("-") if len(zip_code) > 5 else ""

    sub_id = row.get("sub_id")
    try:
        contribution_id = int(sub_id) if sub_id else None
    except (ValueError, TypeError):
        contribution_id = None

    return {
        "contribution_id": contribution_id,
        "street": "",  # FEC doesn't provide street addresses for individuals
        "city": str(row.get("city") or "").strip(),
        "state": str(row.get("state") or "").strip(),
        "zip5": zip5,
        "zip4": zip4,
        "lat": None,
        "lon": None,
        "geocode_confidence": None,
        "model_version": MODEL_VERSION,
    }


def batch_geocode(
    addresses: list[dict],
    batch_size: int = 1000,
    delay: float = 1.0,
) -> list[dict]:
    """Geocode addresses via Census batch geocoder. Returns updated address dicts.

    Input dicts must have: street, city, state, zip5.
    Adds: lat, lon, geocode_confidence.
    """
    if not addresses:
        return []

    results = list(addresses)  # copy

    for i in range(0, len(addresses), batch_size):
        batch = addresses[i:i + batch_size]

        # Build CSV for Census API
        lines = []
        for j, addr in enumerate(batch):
            # Format: id, street, city, state, zip
            street = addr.get("street", "")
            city = addr.get("city", "")
            state = addr.get("state", "")
            zip5 = addr.get("zip5", "")
            lines.append(f"{j},{street},{city},{state},{zip5}")

        csv_content = "\n".join(lines)

        try:
            resp = httpx.post(
                CENSUS_GEOCODE_URL,
                data={"benchmark": "Public_AR_Current", "vintage": "Current_Current"},
                files={"addressFile": ("addresses.csv", csv_content, "text/csv")},
                timeout=120,
            )
            resp.raise_for_status()

            # Parse response CSV
            for line in resp.text.strip().split("\n"):
                parts = line.split('","')
                if len(parts) < 8:
                    continue
                try:
                    idx = int(parts[0].strip('"'))
                    match_type = parts[2].strip('"') if len(parts) > 2 else ""
                    lon_str = parts[5].strip('"') if len(parts) > 5 else ""
                    lat_str = parts[6].strip('"') if len(parts) > 6 else ""

                    actual_idx = i + idx
                    if actual_idx < len(results) and match_type in ("Exact", "Non_Exact"):
                        results[actual_idx]["lat"] = float(lat_str) if lat_str else None
                        results[actual_idx]["lon"] = float(lon_str) if lon_str else None
                        results[actual_idx]["geocode_confidence"] = (
                            0.95 if match_type == "Exact" else 0.7
                        )
                except (ValueError, IndexError):
                    continue

        except Exception as e:
            log.warning("geocode_batch_failed", error=str(e), batch_start=i)

        if i + batch_size < len(addresses):
            time.sleep(delay)  # Rate limiting for Census API

    geocoded = sum(1 for r in results if r.get("lat") is not None)
    log.info("geocoding_complete", total=len(results), geocoded=geocoded)
    return results


def run_address_standardization(parquet_path: Path, geocode: bool = True) -> int:
    """Run address standardization on individual contributions. Returns rows uploaded."""
    with duckdb_connect() as conn:
        df = conn.execute(f"""
            SELECT sub_id, city, state, zip_code
            FROM read_parquet('{parquet_path}')
            WHERE (city IS NOT NULL AND city != '')
               OR (state IS NOT NULL AND state != '')
               OR (zip_code IS NOT NULL AND zip_code != '')
        """).fetchdf()

    log.info("addresses_to_normalize", count=len(df))

    rows = []
    for _, record in df.iterrows():
        row = normalize_address(record.to_dict())
        if row["contribution_id"] is not None:
            rows.append(row)

    log.info("addresses_normalized", count=len(rows))

    if geocode and rows:
        rows = batch_geocode(rows)

    total = upsert("donor_address_normalized", rows, schema="enrichment")
    log.info("address_standardization_complete", rows=total)
    return total
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/smithi/Desktop/beyond-the-vote/pipeline && uv run pytest tests/test_address_standardization.py -v
```

Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add pipeline/enrich/address_standardization.py pipeline/tests/test_address_standardization.py
git commit -m "feat(pipeline): Tier 1d address standardization with Census geocoding"
```

---

## Task 6: Tier 1 orchestrator

**Files:**
- Create: `pipeline/scripts/enrich_tier1.py`

- [ ] **Step 1: Create orchestrator script**

```python
# pipeline/scripts/enrich_tier1.py
"""Run all Tier 1 ML enrichments.

Usage:
    uv run python -m pipeline.scripts.enrich_tier1 [--cycles 2024,2026] [--skip-geocode] [--use-llm]
"""
import argparse
import sys
from pathlib import Path

import structlog

from pipeline.shared.observability import configure_logging, configure_sentry
from pipeline.shared.db import log_run_start, log_run_end
from pipeline.enrich.donor_resolution import run_donor_resolution
from pipeline.enrich.employer_normalization import run_employer_normalization
from pipeline.enrich.industry_classification import run_industry_classification
from pipeline.enrich.address_standardization import run_address_standardization

SCRIPT = "enrich_tier1"
DATA_DIR = Path(__file__).parent.parent / "data"

log = structlog.get_logger()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cycles", type=str, default="2024,2026")
    parser.add_argument("--skip-geocode", action="store_true",
                        help="Skip Census geocoding (faster, no lat/lon)")
    parser.add_argument("--use-llm", action="store_true",
                        help="Use Anthropic API for industry classification instead of local embeddings")
    parser.add_argument("--skip-donor-resolution", action="store_true")
    parser.add_argument("--skip-employer-normalization", action="store_true")
    parser.add_argument("--skip-industry-classification", action="store_true")
    parser.add_argument("--skip-address-standardization", action="store_true")
    args = parser.parse_args()

    cycles = [int(c) for c in args.cycles.split(",")]

    configure_logging(service="pipeline")
    configure_sentry(service="pipeline")

    run_id = log_run_start(SCRIPT)
    total_rows = 0

    try:
        for cycle in cycles:
            indiv_parquet = DATA_DIR / "fec" / str(cycle) / "indiv.parquet"
            if not indiv_parquet.exists():
                log.warning("indiv_parquet_missing", cycle=cycle, path=str(indiv_parquet))
                continue

            log.info("processing_cycle", cycle=cycle)

            # 1a. Donor entity resolution
            if not args.skip_donor_resolution:
                log.info("stage_donor_resolution", cycle=cycle)
                total_rows += run_donor_resolution(indiv_parquet)

            # 1b. Employer normalization
            if not args.skip_employer_normalization:
                log.info("stage_employer_normalization", cycle=cycle)
                total_rows += run_employer_normalization(indiv_parquet)

            # 1d. Address standardization
            if not args.skip_address_standardization:
                log.info("stage_address_standardization", cycle=cycle)
                total_rows += run_address_standardization(
                    indiv_parquet, geocode=not args.skip_geocode
                )

        # 1c. Industry classification (runs once across all employers, not per cycle)
        if not args.skip_industry_classification:
            log.info("stage_industry_classification")
            total_rows += run_industry_classification(use_llm=args.use_llm)

        log_run_end(run_id, "success", rows_processed=total_rows)
        log.info("tier1_complete", total_rows=total_rows)

    except Exception as e:
        log.error("tier1_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/scripts/enrich_tier1.py
git commit -m "feat(pipeline): Tier 1 ML enrichment orchestrator"
```

---

## Parallel execution map

```
Task 1 (stopwords) ──► Task 2 (donor resolution)
                   └──► Task 3 (employer normalization) ──► Task 4 (industry classification)
                   └──► Task 5 (address standardization)
                                                              │
All tasks ──────────────────────────────────────────────────► Task 6 (orchestrator)
```

**Tasks 2, 3, 5** can run in parallel after Task 1 completes (they share the stopwords module but touch different files).

**Task 4** depends on Task 3 (it classifies canonical employers produced by normalization).

**Task 6** depends on all others (it imports from all enrichment modules).
