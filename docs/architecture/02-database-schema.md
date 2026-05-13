# Database Schema

The database uses 8 Postgres schemas organized by domain, with pgvector and pg_trgm extensions enabled. All tables live in a single Neon PostgreSQL instance.

## Schema Map

```
┌───────────────────────────────────────────────────────────────────────┐
│                        Neon PostgreSQL (~1.1 GB)                      │
│                                                                       │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐  │
│  │  congress.* (9) │  │   fec.* (4)    │  │   enrichment.* (5)     │  │
│  │                │  │                │  │                        │  │
│  │ legislators    │  │ pac_to_cand    │  │ donor_canonical        │  │
│  │ bills          │  │ indep_expend   │  │ employer_canonical     │  │
│  │ vote_summaries │  │ cmte_names     │  │ employer_industry      │  │
│  │ vote_positions │  │ candidates     │  │ donor_addr_normalized  │  │
│  │ bill_cosponsors│  │                │  │ bill_embeddings (384d) │  │
│  │ bill_actions   │  └────────────────┘  └────────────────────────┘  │
│  │ committees     │                                                   │
│  │ memberships    │  ┌────────────────┐  ┌────────────────────────┐  │
│  │ member_scores  │  │ analytics.* (6)│  │   anomalies.* (4)      │  │
│  └────────────────┘  │                │  │                        │  │
│                      │ money_flow_attr│  │ suspicious_events      │  │
│  ┌────────────────┐  │ donor_cluster  │  │ change_points          │  │
│  │  derived.* (6) │  │ donor_feat(64d)│  │ geographic_anomalies*  │  │
│  │                │  │ entity_comm*   │  │ amount_anomalies*      │  │
│  │ funding_summary│  │ entity_centr*  │  │                        │  │
│  │ top_pacs       │  │ bundling_evts* │  │ * = schema only        │  │
│  │ top_contribs   │  └────────────────┘  └────────────────────────┘  │
│  │ pac_top_funders│                                                   │
│  │ leaderboard    │  ┌────────────────┐  ┌────────────────────────┐  │
│  │ pac_ai_summries│  │   app.* (4)    │  │   ops.* (7)            │  │
│  └────────────────┘  │                │  │                        │  │
│                      │ profiles       │  │ pipeline_runs          │  │
│                      │ followed_pols  │  │ bulk_checkpoints       │  │
│                      │ tracked_bills  │  │ ml_models (bytea)      │  │
│                      │ topic_prefs    │  │ donor/employer/industry │  │
│                      └────────────────┘  │   _overrides           │  │
│                                          │ alembic_version        │  │
│                                          └────────────────────────┘  │
│  Extensions: pg_trgm 1.6, pgvector 0.8.0                            │
│  Tables: 45 | Indexes: 119 | FKs: 14 | Triggers: 1                  │
└───────────────────────────────────────────────────────────────────────┘

* = table defined in schema.sql but no pipeline code to populate it yet
```

## Schema Purposes

| Schema | Purpose | Written By | Read By |
|--------|---------|------------|---------|
| `congress` | Legislative data — legislators, bills, votes, committees | Pipeline | API |
| `fec` | Raw FEC campaign finance — PAC contributions, independent expenditures | Pipeline | API |
| `enrichment` | ML-cleaned data — condensed canonical donors (1 row per donor, >$200), normalized employers, bill embeddings | Pipeline (Tier 1) | API |
| `analytics` | Pattern detection — donor clusters, donor feature vectors, money flow attribution | Pipeline (Tier 2) | API |
| `anomalies` | Flagged patterns — suspicious contribution events, committee change points | Pipeline (Tier 3) | API |
| `app` | User data — profiles, followed politicians, tracked bills | API | API |
| `derived` | Pre-computed aggregations — funding summaries, leaderboards, PAC top funders | Pipeline | API |
| `ops` | Pipeline operations — run history, checkpoints, ML model storage | Pipeline | Pipeline + API |

## Core Tables

### congress.legislators

The central entity table. `bioguide_id` is the universal key — all other tables FK to it.

```sql
CREATE TABLE congress.legislators (
    bioguide_id     text PRIMARY KEY,
    lis_id          text UNIQUE,           -- Senate identifier
    icpsr_id        integer,               -- VoteView identifier
    fec_ids         text[],                -- Array of FEC committee IDs
    first_name      text NOT NULL,
    last_name       text NOT NULL,
    full_name       text NOT NULL,
    party           text NOT NULL,         -- Democrat, Republican, Independent
    chamber         text NOT NULL,         -- senate, house
    state           text NOT NULL,         -- 2-letter code
    district        integer,               -- NULL for senators
    in_office       boolean DEFAULT true,
    photo_url       text,
    fec_committee_id text,                 -- Primary campaign committee
    ...
);

-- GIN index on fec_ids for ANY() joins with FEC data
CREATE INDEX ON congress.legislators USING gin(fec_ids);
```

**Key relationships:**
- `fec_ids` (array) links to FEC data via `ANY()` operator (GIN-indexed)
- `bioguide_id` is FK target for votes, bills, committees, scores, app follows

### congress.bills

Bills with full-text search support via a `tsvector` column maintained by a trigger.

```sql
CREATE TABLE congress.bills (
    bill_id         text PRIMARY KEY,      -- e.g. "119-hr-4521"
    congress        integer NOT NULL,
    bill_type       text NOT NULL,         -- hr, s, sjres, hjres, etc.
    title           text NOT NULL,
    summary         text,
    combined_text   text,                  -- Title + summary for embedding
    status          text,                  -- Active, Committee, Passed, etc.
    policy_area     text,                  -- Congress.gov policy area
    topics          text[] NOT NULL DEFAULT '{}',
    sponsor_bioguide_id text REFERENCES congress.legislators(bioguide_id),
    search_vector   tsvector,              -- Auto-maintained by trigger
    ...
);

-- Weighted tsvector trigger: title(A) > summary(B) > sponsor+topics(C) > bill_number(D)
CREATE TRIGGER bills_search_vector_trigger
    BEFORE INSERT OR UPDATE ON congress.bills
    FOR EACH ROW EXECUTE FUNCTION congress.bills_search_vector_update();
```

**Indexes:**
- `GIN(search_vector)` — full-text search
- `GIN(title gin_trgm_ops)` — trigram similarity for fuzzy matching
- `GIN(topics)` — array containment queries
- B-tree on `congress`, `status`, `policy_area`

### enrichment.bill_embeddings

384-dimensional vectors for semantic search, indexed with HNSW.

```sql
CREATE TABLE enrichment.bill_embeddings (
    bill_id     text PRIMARY KEY REFERENCES congress.bills(bill_id),
    embedding   vector(384) NOT NULL,      -- all-MiniLM-L6-v2
    model_version text NOT NULL,
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX ON enrichment.bill_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
```

### analytics.money_flow_attribution

Traces PAC donation chains across multiple hops.

```sql
CREATE TABLE analytics.money_flow_attribution (
    id                      bigserial PRIMARY KEY,
    destination_committee_id text NOT NULL,
    origin_entity_id        text NOT NULL,
    origin_entity_type      text NOT NULL,    -- pac, individual, etc.
    attributed_amount       numeric(12,2) NOT NULL,
    hop_count               integer NOT NULL, -- 1 = direct, 2+ = indirect
    path                    text[],           -- Array of intermediate entity IDs
    cycle                   smallint NOT NULL,
    ...
);
```

### ops.ml_models

ML models stored as serialized bytes — no filesystem dependency.

```sql
CREATE TABLE ops.ml_models (
    id            bigserial PRIMARY KEY,
    model_name    text NOT NULL,           -- e.g. 'vote_prediction'
    congress      integer,                 -- Per-congress models
    model_bytes   bytea NOT NULL,          -- joblib-serialized sklearn model
    accuracy      real,
    feature_names text[],
    trained_at    timestamptz DEFAULT now(),
    model_version text NOT NULL
);
```

## Foreign Key Graph

```
congress.legislators (bioguide_id)
    ├── congress.bills (sponsor_bioguide_id)
    ├── congress.bill_vote_positions (bioguide_id)
    ├── congress.committee_memberships (bioguide_id)
    ├── congress.member_scores (bioguide_id)
    ├── app.followed_politicians (politician_id)
    ├── derived.legislator_funding_summary (bioguide_id)
    ├── derived.legislator_top_pacs (bioguide_id)
    └── derived.legislator_top_contributors (bioguide_id)

congress.bills (bill_id)
    ├── congress.bill_vote_summaries (bill_id)
    ├── congress.bill_cosponsors (bill_id)
    ├── congress.bill_actions (bill_id)
    ├── enrichment.bill_embeddings (bill_id)
    └── app.tracked_bills (bill_id)

congress.bill_vote_summaries (id)
    └── congress.bill_vote_positions (vote_id) [CASCADE]

congress.committees (thomas_id)
    ├── congress.committees (parent_id) [self-ref]
    └── congress.committee_memberships (committee_id)
```

## Indexing Strategy

| Type | Tables | Purpose |
|------|--------|---------|
| **GIN (tsvector)** | `bills.search_vector` | Full-text search with `@@` operator |
| **GIN (trigram)** | `bills.title`, `leaderboard_cache.cmte_name` | Fuzzy `similarity()` matching |
| **GIN (array)** | `bills.topics`, `legislators.fec_ids` | Array containment (`&&`, `@>`, `ANY`) |
| **HNSW (vector)** | `bill_embeddings.embedding`, `donor_feature_vectors.embedding` | Approximate nearest-neighbor (cosine) |
| **B-tree** | All FKs, `cycle`, `status`, `congress`, `committee_id` | Standard equality/range filters |

## Extensions Required

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- Trigram similarity
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector for embeddings
```
