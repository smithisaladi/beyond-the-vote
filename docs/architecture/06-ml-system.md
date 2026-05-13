# ML & AI System

The platform uses machine learning at two levels: offline enrichment in the pipeline and real-time inference in the API. Models range from simple clustering to trained classifiers, all running without GPU.

## ML Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    OFFLINE (Pipeline)                           │
│                                                                 │
│  sentence-transformers ──> Bill embeddings (384d, pgvector)     │
│  TF-IDF + cosine       ──> Donor entity resolution              │
│  HDBSCAN               ──> Donor behavioral clustering          │
│  UMAP                  ──> Donor feature vectors (64d)          │
│  NetworkX              ──> Money flow graph traversal            │
│  Ruptures              ──> Change-point detection               │
│  scikit-learn          ──> Vote prediction models               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    ONLINE (API)                                 │
│                                                                 │
│  sentence-transformers ──> Query-time embedding for search       │
│  joblib + sklearn      ──> Vote prediction inference            │
│  pgvector (<=>)        ──> Donor similarity (nearest-neighbor)   │
│  Anthropic API         ──> PAC summary generation (Claude)       │
└─────────────────────────────────────────────────────────────────┘
```

## Bill Semantic Search

**Model:** `sentence-transformers/all-MiniLM-L6-v2`
- 384-dimensional embeddings
- ~22M parameters
- CPU-only (no GPU required)

**Offline:** Pipeline embeds all bills (`combined_text` = title + summary) and stores vectors in `enrichment.bill_embeddings` with an HNSW index.

**Online:** When a user searches, the query is embedded at request time and compared against stored vectors using pgvector's cosine distance operator (`<=>`). This is one of three signals in the hybrid search (see [Search System](04-search-system.md)).

```python
# Loaded once at API startup
_model = SentenceTransformer("all-MiniLM-L6-v2")

def get_embedding(text: str) -> list[float]:
    return _model.encode(text, convert_to_numpy=True).tolist()
```

## Vote Prediction

**Goal:** Predict how a legislator will vote on a bill based on their ideology and the bill's characteristics.

**Model:** scikit-learn classifier (logistic regression), trained per Congress session.

**Features (5):**
| Feature | Source | Description |
|---------|--------|-------------|
| `nominate_dim1` | VoteView | Liberal-conservative score (-1 to +1) |
| `nominate_dim2` | VoteView | Social/economic cross-pressure |
| `same_party` | Derived | 1 if legislator's party matches sponsor's party |
| `topic_count` | Bill metadata | Number of topics on the bill |
| `is_policy_health` | Bill metadata | 1 if bill's policy area is health |

**Training (offline):**
```python
# pipeline/enrich/vote_prediction.py
model = LogisticRegression()
model.fit(X_train, y_train)
# Serialize and store in ops.ml_models
model_bytes = joblib.dumps(model)
# → INSERT INTO ops.ml_models (model_name, congress, model_bytes, accuracy, ...)
```

**Inference (online):**
```python
# apps/api/app/ml/vote_prediction.py
def predict_vote(congress: int, features: list[float]) -> dict:
    model = _models[congress]          # Loaded at startup from DB
    X = np.array([features])
    prediction = model.predict(X)[0]   # 1 = Yea, 0 = Nay
    probabilities = model.predict_proba(X)[0]
    return {
        "prediction": "Yea" if prediction == 1 else "Nay",
        "probability": float(max(probabilities)),
        "yeaProbability": float(probabilities[1]),
        "nayProbability": float(probabilities[0]),
        "modelAccuracy": _accuracies[congress],
    }
```

**Model storage:** Models are serialized with joblib, base64-encoded (or stored as bytea), and saved in `ops.ml_models`. At API startup, all models are loaded into memory. This eliminates filesystem dependencies — critical for ephemeral containers on Render.

## Donor Similarity (pgvector)

**Goal:** Find donors with similar giving patterns.

**Offline enrichment** (computed by `donor_clustering` module):
1. Builds behavioral features per canonical donor: total amount, contribution count, party split (% D/R), state count, recipient type split (candidate vs PAC)
2. Features are reduced to 64 dimensions via UMAP
3. Stored in `analytics.donor_feature_vectors` with HNSW index
4. The table also stores derived columns (`party_split_d`, `party_split_r`, `geographic_spread`, etc.) for the API to return alongside similarity scores

**Online query:**
```sql
SELECT dfv.canonical_donor_id,
       1 - (dfv.embedding <=> :query_embedding) AS similarity
FROM analytics.donor_feature_vectors dfv
WHERE dfv.canonical_donor_id != :id
ORDER BY dfv.embedding <=> :query_embedding
LIMIT :limit
```

The `<=>` operator computes cosine distance, and HNSW provides approximate nearest-neighbor search.

## Donor Entity Resolution

FEC data contains millions of individual contributions with messy names (typos, abbreviations, maiden names) and no unique donor ID. The pipeline resolves these into canonical donor identities using a three-pass algorithm:

```
"MUSK, ELON" / "SPACE EXPLORATION TECHNOLOGIES" / TX 78701  ──┐
"MUSK, ELON" / ""                                / TX 78752  ──┼──> canonical_id: "d_4021220261308173929"
"MUSK, ELON" / "SPACEX"                          / CA 90250  ──┘    total: $80M, confidence: 0.75
```

**Pass 1 (Blocking):** Groups by `(last_name[:3], zip5)` to avoid O(n^2) pairwise comparisons.

**Pass 2 (Within-Block Clustering):** Fast-path skips embedding for blocks where all donors share the same name+employer. Remaining blocks use sentence-transformer embeddings + Agglomerative Clustering (cosine distance, threshold 0.15).

**Pass 3 (Cross-Block Merge):** Merges canonical donors split across blocks. Groups by normalized name, merges if they share employer (substring match) or state.

**Output:** Condensed schema — one row per canonical donor with aggregated totals. 22M contributions → 1.29M donors (>$200 threshold). See [Money Flow System](09-money-flow-system.md) for the full algorithm.

## Donor Clustering (UMAP + HDBSCAN)

Groups donors by behavioral patterns (not identity). The `donor_clustering` module computes both the feature vectors and cluster assignments in a single pipeline step.

**Features per canonical donor (7):** total amount, contribution count, party split (% D/R), state count (geographic spread), recipient type split (candidate vs PAC).

**Process:**
1. Build feature matrix from canonical donors
2. Reduce to 64 dimensions via UMAP
3. Cluster with HDBSCAN
4. Store embeddings in `analytics.donor_feature_vectors` (64d, HNSW-indexed)
5. Store cluster assignments in `analytics.donor_cluster` with distance-to-centroid

HDBSCAN is used because:
- Doesn't require specifying cluster count upfront
- Handles noise (outlier donors are labeled as noise, not forced into clusters)
- Finds clusters of varying density

## Money Flow Graph

Traces how money moves through PAC networks:

```
Origin PAC A ──$50K──> Intermediary PAC B ──$30K──> Candidate C
        hop_count=1           hop_count=2
        path=[A]              path=[A, B]
```

**Method:** NetworkX graph traversal on `fec.pac_to_candidate` + PAC-to-PAC transfers. Computes attributed amounts with hop counts up to 5. Results stored in `analytics.money_flow_attribution`.

## AI-Generated Summaries

PAC detail pages can generate AI summaries using the Anthropic API:

```python
# POST /api/donors/{cmte_id}/summary
client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
response = client.messages.create(
    model="claude-3-5-haiku-latest",
    messages=[{"role": "user", "content": prompt}],
)
# Cache in DB for 30 days
```

Summaries describe funding patterns, top recipients, and spending behavior for a given PAC.

## Change-Point Detection

Detects sudden behavioral shifts in committee spending patterns:

```
Monthly spending: $10K, $12K, $11K, $50K, $48K, $55K
                                     ↑
                              Change point detected
                              magnitude: 4.2x
                              direction: increase
```

**Method:** `ruptures` library (PELT algorithm) on monthly time-series data. Detects both spend rate and activity level shifts with a minimum 30% magnitude threshold. Results stored in `anomalies.committee_change_points`.

> **Not yet implemented:** The schema defines tables for `analytics.bundling_events`, `analytics.entity_community`, `analytics.entity_centrality`, `anomalies.geographic_anomalies`, and `anomalies.amount_distribution_anomalies`, but no pipeline code or API endpoints exist for these yet.

## Model Loading at Startup

```python
# apps/api/app/ml/__init__.py
async def load_all_models():
    """Called during FastAPI lifespan startup."""
    # 1. Load sentence-transformers (always, from disk/cache)
    load_embedding_model()

    # 2. Load vote prediction models (from database)
    async with get_session() as db:
        await load_vote_models(db)
```

The lifespan hook ensures all models are loaded before the API accepts requests. If a model fails to load, the API continues running — affected endpoints return graceful error messages or skip that signal.
