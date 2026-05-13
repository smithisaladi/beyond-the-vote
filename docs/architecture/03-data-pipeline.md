# Data Pipeline

The pipeline is a Python ETL system that ingests data from 4 external sources, transforms it, loads it into Neon PostgreSQL, and runs 3 tiers of ML enrichment. It runs on GitHub Actions (daily + weekly schedules) and can be executed locally.

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       DATA SOURCES                              │
│                                                                 │
│  Congress.gov API    FEC Bulk Files    VoteView CSV    YAML     │
│  (bills, votes)     (PAC, IE, names)  (NOMINATE)     (bios)    │
└────────┬─────────────────┬────────────────┬────────────┬────────┘
         │                 │                │            │
         v                 v                v            v
┌─────────────────────────────────────────────────────────────────┐
│                        INGEST                                   │
│                                                                 │
│  congress.py          fec.py            voteview.py  legis.py   │
│  (usc-run scraper)    (bulk download)   (CSV fetch)  (YAML)    │
│                       fec_api.py                                │
│                       (OpenFEC API)                             │
└────────┬─────────────────┬────────────────┬────────────┬────────┘
         │                 │                │            │
         v                 v                v            v
┌─────────────────────────────────────────────────────────────────┐
│                       TRANSFORM                                 │
│                                                                 │
│  bills.py    fec.py         member_scores.py    legislators.py  │
│  votes_house.py             committees.py                       │
│  votes_senate.py                                                │
└────────┬─────────────────┬────────────────┬────────────┬────────┘
         │                 │                │            │
         v                 v                v            v
┌─────────────────────────────────────────────────────────────────┐
│                         LOAD                                    │
│                                                                 │
│  bills.py    fec.py    scores.py    legislators.py              │
│  votes.py              embeddings.py                            │
│                                                                 │
│  All writers use shared.db.upsert() for idempotent writes       │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              v
┌─────────────────────────────────────────────────────────────────┐
│                     ML ENRICHMENT                               │
│                                                                 │
│  Tier 1: donor_resolution, employer_norm, industry_class,       │
│          address_std, stopwords                                  │
│                              │                                  │
│  Tier 2: donor_clustering, donor_feature_vectors, money_flow,   │
│          bundling_detection                                     │
│                              │                                  │
│  Tier 3: suspicious_clusters, change_detection,                 │
│          geographic_anomalies, amount_anomalies                 │
└─────────────────────────────────────────────────────────────────┘
```

## Run Order (FK Dependencies)

The pipeline must run in this order due to foreign key constraints:

| Step | Script | Target Tables |
|------|--------|---------------|
| 1 | Legislators | `congress.legislators`, `congress.committee_memberships` |
| 2 | Scores | `congress.member_scores` |
| 3 | Bills | `congress.bills`, `congress.bill_cosponsors`, `congress.bill_actions` |
| 4 | Votes | `congress.bill_vote_summaries`, `congress.bill_vote_positions` |
| 5 | FEC | `fec.pac_to_candidate`, `fec.independent_expenditures`, `fec.cmte_names` |
| 6 | Embeddings | `enrichment.bill_embeddings` |
| 7 | Tier 1-3 | `enrichment.*`, `analytics.*`, `anomalies.*` |

## Incremental Sync via Watermarks

Every pipeline execution is tracked in `ops.pipeline_runs`:

```sql
CREATE TABLE ops.pipeline_runs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    script_name     text NOT NULL,
    started_at      timestamptz DEFAULT now(),
    finished_at     timestamptz,
    status          text NOT NULL DEFAULT 'running',
    rows_processed  integer DEFAULT 0,
    rows_skipped    integer DEFAULT 0,
    errors          integer DEFAULT 0,
    watermark       timestamptz,      -- High-water mark for incremental fetches
    metadata        jsonb,
    error_detail    text
);
```

**Flow:**
1. Script calls `log_run_start("script_name")` → creates pipeline_run row
2. Calls `get_watermark("script_name")` → fetches last successful watermark
3. Fetches only data newer than watermark
4. Calls `log_run_end(run_id, rows, watermark)` → updates row, sets new watermark

This enables incremental daily syncs (only new/updated bills since last run) without re-processing everything.

## DuckDB for FEC Aggregation

FEC bulk files are enormous (individual contributions are ~4GB per election cycle). The pipeline uses DuckDB as an in-memory analytical engine:

```python
# DuckDB reads pipe-delimited FEC files directly
SELECT cmte_id, SUM(transaction_amt) as total
FROM read_csv('data/processed/fec/pas2.csv', delim='|', header=true)
WHERE cycle = 2024
GROUP BY cmte_id
```

DuckDB is used **only for local aggregation** — results are then loaded into Postgres via `upsert()`. DuckDB never writes directly to the database.

**Why DuckDB over pandas?**
- Handles 4GB+ files without loading into memory
- SQL interface is natural for aggregation
- Parquet/CSV support out of the box
- 10-100x faster than pandas for grouped aggregations

## ML Enrichment Tiers

### Tier 1: Entity Resolution & Normalization

| Module | Input | Output | Method |
|--------|-------|--------|--------|
| `donor_resolution` | Raw FEC individual contributions (indiv.parquet) | `enrichment.donor_canonical` (condensed, 1 row per donor, >$200) | Blocking (name+zip) → fast-path exact match → embedding clustering → cross-block merge |
| `employer_normalization` | Raw employer strings | `enrichment.employer_canonical` | Fuzzy matching + manual overrides |
| `industry_classification` | Canonical employers | `enrichment.employer_industry` | Keyword rules + classifier (~20 buckets) |
| `address_standardization` | Raw addresses | `enrichment.donor_address_normalized` | Parsing + optional geocoding |
| `stopwords` | All text fields | Cleaned text | Custom political stopword list |

**Donor resolution detail:** The condensed schema stores one row per canonical donor (not per contribution) with aggregated totals, reducing 24M contributions to 1.29M rows (~370MB vs ~4.8GB). A three-pass algorithm — blocking, within-block clustering with fast-path optimization (9x speedup), and cross-block merge for donors split across ZIPs — handles the scale. See [Money Flow System](09-money-flow-system.md) for full details.

### Tier 2: Pattern Detection

| Module | Input | Output | Method |
|--------|-------|--------|--------|
| `donor_clustering` | Canonical donors | `analytics.donor_cluster` + `analytics.donor_feature_vectors` (vector 64) | UMAP dimensionality reduction + HDBSCAN clustering |
| `money_flow` | PAC-to-PAC + PAC-to-candidate | `analytics.money_flow_attribution` | NetworkX graph traversal with proportional attribution |

### Tier 3: Anomaly Detection

| Module | Input | Output | Method |
|--------|-------|--------|--------|
| `suspicious_clusters` | Donor clusters + contributions | `anomalies.suspicious_contribution_events` | 5-signal rule-based scoring (same-day clusters, first-time ratio, amount variance, shared employer, shared ZIP) |
| `change_detection` | Monthly committee spending | `anomalies.committee_change_points` | PELT algorithm via ruptures library |

> **Schema-only tables (not yet populated):** `analytics.bundling_events`, `analytics.entity_community`, `analytics.entity_centrality`, `anomalies.geographic_anomalies`, `anomalies.amount_distribution_anomalies` are defined in `schema.sql` but have no pipeline code or API endpoints yet.

## Embedding Generation

Bill embeddings use `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions, ~22M parameters):

```python
# pipeline/shared/embeddings.py
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")
embedding = model.encode(bill.combined_text, convert_to_numpy=True)
# → list[float] of length 384
```

Embeddings are stored in `enrichment.bill_embeddings` with an HNSW index for fast cosine similarity search.

## GitHub Actions Schedules

| Workflow | Schedule | Steps |
|----------|----------|-------|
| `sync-daily.yml` | 6am UTC weekdays | Legislators → VoteView → Bills → Votes |
| `sync-weekly.yml` | Sunday 7am UTC | FEC API → Legislators → VoteView → Enrichment |
| `pipeline-ci.yml` | On push | Run `pytest` test suite |

## Data Volume Estimates

| Data | Volume | Notes |
|------|--------|-------|
| Legislators | ~540 current | House (435) + Senate (100) + delegates |
| Bills per Congress | ~15,000-20,000 | 2-year session |
| Vote positions | ~500K per Congress | Each roll call × each member |
| PAC contributions | ~500K per cycle | Direct PAC-to-candidate |
| Independent expenditures | ~200K per cycle | Super PAC spending |
| Individual contributions | ~4GB per cycle | **Processed locally only, never loaded to DB** |
| Bill embeddings | ~40K vectors | 384 dims × all bills |
| Donor feature vectors | Variable | 64 dims × canonical donors |

## Key Implementation Details

**`shared/db.py` — Upsert pattern:**
```python
def upsert(conn, table, rows, conflict_columns, update_columns):
    """ON CONFLICT DO UPDATE for idempotent writes."""
    # Uses psycopg2 execute_values for batch efficiency
```

**FEC gotchas:**
- Bulk files are pipe-delimited (`|`), no headers
- Column positions defined in `config.py` (CN_COLS, CM_COLS, etc.)
- Date format is `MMDDYYYY` — requires `normalize_fec_date()`
- Transaction codes: `24K`/`24Z` = PAC direct, `24E` = IE support, `24A` = IE oppose

**Rate limiting:**
- Congress.gov: 1000 req/hr → enforced at 950 threshold
- OpenFEC: standard rate limits → configurable in `config.py`
