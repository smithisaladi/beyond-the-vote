# Hybrid Search System

Bill search uses a 3-signal ranking system combining full-text search, trigram similarity, and semantic vector search, fused via Reciprocal Rank Fusion (RRF). This is the most complex query in the system.

## Why Hybrid Search?

Each search method has strengths and weaknesses:

| Method | Strength | Weakness |
|--------|----------|----------|
| **Full-text (FTS)** | Exact keyword matching, fast | Misses synonyms, no semantic understanding |
| **Trigram** | Handles typos, partial matches | Only matches title, no semantic understanding |
| **Semantic** | Understands meaning, finds related concepts | Slower, requires embedding model, can be noisy |

Combining all three with RRF produces results that are robust to any single signal failing.

## Architecture

```
User Query: "healthcare costs"
        │
        ├──────────────────────┬──────────────────────┐
        v                      v                      v
  ┌──────────┐         ┌──────────┐          ┌──────────────┐
  │   FTS    │         │  Trigram  │          │   Semantic   │
  │          │         │          │          │              │
  │websearch_│         │similarity│          │ embedding    │
  │to_tsquery│         │(title,q) │          │ <=> cosine   │
  │          │         │ > 0.1    │          │ distance     │
  │ TOP 100  │         │ TOP 100  │          │ TOP 100      │
  └────┬─────┘         └────┬─────┘          └──────┬───────┘
       │                    │                       │
       v                    v                       v
  ┌─────────────────────────────────────────────────────┐
  │              Reciprocal Rank Fusion                  │
  │                                                     │
  │  score = 1/(60+rank_fts)                            │
  │        + 0.5/(60+rank_trgm)                         │
  │        + 0.8/(60+rank_sem)                          │
  │                                                     │
  │  FULL OUTER JOIN on bill_id                         │
  │  ORDER BY rrf_score DESC                            │
  └─────────────────────────────────────────────────────┘
```

## The SQL Query

The query is built dynamically in `apps/api/app/queries/bills.py`:

```sql
WITH tsq AS (
    -- Parse user query into tsquery tokens
    SELECT websearch_to_tsquery('english', :query) AS q
),
fts AS (
    -- Signal 1: Full-text search on tsvector
    SELECT b.bill_id,
           ts_rank_cd(b.search_vector, tsq.q) AS fts_score,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(b.search_vector, tsq.q) DESC) AS fts_rank
    FROM congress.bills b, tsq
    WHERE b.search_vector @@ tsq.q AND {filters}
    LIMIT 100
),
trgm AS (
    -- Signal 2: Trigram similarity on title
    SELECT b.bill_id,
           similarity(b.title, :query) AS trgm_score,
           ROW_NUMBER() OVER (ORDER BY similarity(b.title, :query) DESC) AS trgm_rank
    FROM congress.bills b
    WHERE similarity(b.title, :query) > 0.1 AND {filters}
    LIMIT 100
),
semantic AS (
    -- Signal 3: Cosine similarity on embeddings (when available)
    SELECT be.bill_id,
           1 - (be.embedding <=> :embedding::vector) AS sem_score,
           ROW_NUMBER() OVER (ORDER BY be.embedding <=> :embedding::vector) AS sem_rank
    FROM enrichment.bill_embeddings be
    JOIN congress.bills b ON b.bill_id = be.bill_id
    WHERE {filters}
    LIMIT 100
),
fused AS (
    -- RRF fusion: combine all three signals
    SELECT COALESCE(f.bill_id, t.bill_id, s.bill_id) AS bill_id,
           COALESCE(1.0 / (60 + f.fts_rank), 0) +
           COALESCE(0.5 / (60 + t.trgm_rank), 0) +
           COALESCE(0.8 / (60 + s.sem_rank), 0) AS rrf_score
    FROM fts f
    FULL OUTER JOIN trgm t ON f.bill_id = t.bill_id
    FULL OUTER JOIN semantic s ON COALESCE(f.bill_id, t.bill_id) = s.bill_id
)
SELECT b.*, fused.rrf_score, COUNT(*) OVER() AS total_count
FROM fused
JOIN congress.bills b ON b.bill_id = fused.bill_id
ORDER BY fused.rrf_score DESC
LIMIT :limit OFFSET :offset
```

## Reciprocal Rank Fusion (RRF)

RRF is a rank aggregation method that combines ranked lists without requiring score normalization:

```
RRF_score(doc) = Σ 1 / (k + rank_i(doc))
```

Where `k` is a constant (60 in our case, standard value from the original RRF paper) and `rank_i` is the rank in each signal's list.

**Our weights:**
- FTS: `1.0 / (60 + rank)` — highest weight (exact matches matter most)
- Semantic: `0.8 / (60 + rank)` — strong weight (captures meaning)
- Trigram: `0.5 / (60 + rank)` — lower weight (fuzzy fallback)

**Why RRF over linear combination?**
- No need to normalize scores across different scales (FTS score vs cosine distance)
- Robust to outlier scores in any single signal
- A document ranked #1 by any signal will score highly, even if missing from other lists
- The FULL OUTER JOIN ensures documents found by any signal are included

## Graceful Degradation

The system degrades gracefully when the embedding model is unavailable:

```python
# In the API router
query_embedding = None
if is_model_loaded():
    query_embedding = get_embedding(query)

# In the query builder
if query_embedding is not None:
    # 3-signal RRF (FTS + trigram + semantic)
else:
    # 2-signal RRF (FTS + trigram only)
```

This means the search still works without ML models — it just loses semantic understanding.

## Query-Time Embedding

When semantic search is available, the user's query is embedded at request time:

```python
# apps/api/app/ml/embeddings.py
from sentence_transformers import SentenceTransformer

_model = SentenceTransformer("all-MiniLM-L6-v2")  # Loaded once at startup

def get_embedding(text: str) -> list[float]:
    return _model.encode(text, convert_to_numpy=True).tolist()
```

The query embedding is compared against pre-computed bill embeddings stored in `enrichment.bill_embeddings` using pgvector's `<=>` cosine distance operator.

## Tsvector Configuration

The `search_vector` column is maintained by a trigger with weighted sections:

```sql
NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('english',
        coalesce(NEW.sponsor_name, '') || ' ' ||
        coalesce(NEW.policy_area, '') || ' ' ||
        coalesce(array_to_string(NEW.topics, ' '), '')
    ), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.bill_number, '')), 'D');
```

**Weight priority:** Title (A) > Summary (B) > Sponsor/Topics (C) > Bill Number (D)

The `ts_rank_cd` function uses these weights when scoring matches, so a title match ranks higher than a summary match.

## Performance Considerations

- Each CTE is `LIMIT 100` to cap the candidate set before fusion
- Trigram threshold `> 0.1` filters out very poor matches early
- HNSW index on embeddings gives approximate (not exact) nearest neighbors — fast but not perfectly ordered
- `COUNT(*) OVER()` window function gives total count without a separate query
- The query is parameterized (no string interpolation for user input) — SQL injection safe

## Filters

All three signals share the same filter clause, applied within each CTE:

```sql
-- Status filter (e.g. "Active", "Passed")
b.status = ANY(:statuses)

-- Topic filter (array overlap)
b.topics && :topics

-- Congress filter
b.congress = :congress
```

Filters are additive (AND) and optional — omitting a filter returns all matching documents.
