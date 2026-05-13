# Beyond the Ballot — Full-Stack Refactor + ML Enrichment Design Spec

**Date:** 2026-05-10
**Status:** Draft

---

## 1. Overview

A complete stack refactor from Next.js + Supabase-everywhere to Vite/React SPA + FastAPI + Python pipeline, with ML enrichment on FEC campaign finance data. Supabase remains as Postgres host and auth provider only.

### Goals

- Own the backend as a real Python service that can host ML
- Reduce Supabase reliance to Postgres hosting + Auth
- Enable ML on FEC data with a clean place for it to live
- Robust bill/vote ingestion via `unitedstates/congress`
- Semantic search for bills via pgvector
- Learning over speed

### Non-goals

- Live ML serving or GPU infrastructure
- Real-time features (WebSockets, SSE)
- SEO optimization (no SSR — acceptable for a side project)
- Multi-tenant or team features

---

## 2. Target Architecture

```
Local Machine (development + ML)
├── Pipeline (Python 3.11+)
│   ├── usc-run → JSON → loader → Supabase
│   ├── congress-legislators YAML → loader → Supabase
│   ├── FEC bulk files → local Parquet → aggregations → Supabase
│   ├── Bill embedding (all-MiniLM-L6-v2) → Supabase (pgvector)
│   └── ML enrichment (sentence-transformers, HDBSCAN, etc.) → results → Supabase
│
Render
├── FastAPI (async + SQLAlchemy 2.0 + asyncpg)
│   ├── Supabase JWT validation via JWKS
│   ├── Pydantic schemas → OpenAPI → TypeScript codegen
│   ├── Hybrid search (FTS + trigram + semantic via pgvector)
│   ├── Rate limiting (slowapi)
│   ├── Sentry + structlog + request IDs
│   └── /healthz with DB ping
│
Vercel
├── Vite SPA (React 19 + TanStack Router + TanStack Query)
│   ├── Supabase JS client (auth only — no data queries)
│   ├── openapi-fetch typed client → FastAPI
│   └── Sentry (@sentry/react)
│
Supabase
├── Postgres (domain-organized schemas + pgvector)
├── Auth (JWT issuance, JWKS endpoint)
└── No RLS for API access (FastAPI owns authorization)
```

### Data flow

```
[FEC bulk files]──→ local Parquet ──→ ML enrichment ──→ Supabase (enrichment.*, analytics.*, derived.*)
[usc-run]─────────→ JSON on disk ──→ loader ──────────→ Supabase (congress.*)
[congress-legislators]─→ YAML ─────→ loader ──────────→ Supabase (congress.legislators)
[VoteView CSV]────→ loader ────────────────────────────→ Supabase (congress.member_scores)

Browser ──→ Supabase Auth (login/signup/refresh)
Browser ──→ FastAPI (all data, JWT in Authorization header)
FastAPI ──→ Supabase Postgres (read, occasional user-data writes)
```

---

## 3. Repository Layout

```
beyond-the-ballot/
├── apps/
│   ├── web/                          # Vite SPA
│   │   ├── src/
│   │   │   ├── routes/               # TanStack Router file-based routes
│   │   │   ├── components/           # Feature-organized (ported from current)
│   │   │   ├── hooks/queries/        # TanStack Query hooks per resource
│   │   │   ├── lib/
│   │   │   │   ├── api/              # openapi-fetch client + generated types
│   │   │   │   ├── auth/             # Supabase JS client + auth hooks
│   │   │   │   └── ui.ts            # Design system constants (unchanged)
│   │   │   └── main.tsx
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── api/                          # FastAPI backend
│       ├── app/
│       │   ├── routers/              # One router per domain (bills, politicians, donors, dashboard, ml)
│       │   ├── ml/                   # ML model loading + inference (vote prediction, embeddings)
│       │   ├── schemas/              # Pydantic request/response models
│       │   ├── db/
│       │   │   ├── models/           # SQLAlchemy 2.0 models, one module per schema
│       │   │   │   ├── congress.py
│       │   │   │   ├── fec.py
│       │   │   │   ├── enrichment.py
│       │   │   │   ├── analytics.py
│       │   │   │   ├── anomalies.py
│       │   │   │   ├── app.py
│       │   │   │   ├── derived.py
│       │   │   │   └── ops.py
│       │   │   └── session.py        # Async engine + session factory
│       │   ├── queries/              # Complex SQL (hybrid search, money flow)
│       │   ├── deps.py               # FastAPI dependencies (auth, DB session)
│       │   ├── auth.py               # Supabase JWT validation via JWKS
│       │   ├── logging.py            # structlog configuration
│       │   ├── middleware/
│       │   │   └── request_id.py     # X-Request-ID generation + propagation
│       │   └── main.py
│       ├── alembic/
│       │   └── versions/             # Schema migrations (clean rebuild)
│       ├── tests/
│       └── pyproject.toml
│
├── pipeline/                         # Python ETL + ML (rewritten)
│   ├── ingest/
│   │   ├── congress.py               # Wraps usc-run, parses JSON output
│   │   ├── legislators.py            # git-syncs congress-legislators YAML
│   │   ├── fec.py                    # FEC bulk download + Parquet conversion
│   │   └── voteview.py               # VoteView CSV fetch
│   ├── load/
│   │   ├── bills.py                  # Parse usc-run JSON → congress.bills
│   │   ├── legislators.py            # Parse YAML → congress.legislators
│   │   ├── votes.py                  # Parse usc-run vote JSON → congress.bill_vote_*
│   │   ├── fec.py                    # Parquet aggregations → fec.*, derived.*
│   │   └── embeddings.py            # Bill embedding → enrichment.bill_embeddings
│   ├── enrich/
│   │   ├── donor_resolution.py       # Tier 1a: entity resolution
│   │   ├── employer_normalization.py # Tier 1b: employer clustering
│   │   ├── industry_classification.py# Tier 1c: LLM batch classification
│   │   ├── address_standardization.py# Tier 1d: usaddress + geocoding
│   │   ├── donor_clustering.py       # Tier 2a: behavioral segments
│   │   ├── money_flow.py             # Tier 2d: PAC chain tracing
│   │   ├── vote_prediction.py        # Train vote prediction model (logistic regression)
│   │   ├── suspicious_clusters.py    # Tier 3a: straw donor detection
│   │   └── change_detection.py       # Tier 3b: committee behavioral shifts
│   ├── shared/
│   │   ├── db.py                     # Supabase connection (upload results)
│   │   ├── embeddings.py             # sentence-transformers model loading
│   │   ├── observability.py          # structlog + Sentry init
│   │   └── parquet.py                # DuckDB/Parquet utilities
│   ├── data/                         # Local data (gitignored)
│   │   ├── congress/                 # usc-run output
│   │   ├── legislators/              # congress-legislators clone
│   │   ├── fec/                      # Raw FEC files + Parquet
│   │   └── models/                   # Cached sentence-transformers
│   ├── scripts/
│   │   ├── ingest_all.py             # Full pipeline run
│   │   ├── ingest_incremental.py     # Incremental sync
│   │   ├── enrich_tier1.py           # Run all Tier 1 enrichments
│   │   ├── enrich_tier2.py           # Run all Tier 2 enrichments
│   │   ├── enrich_tier3.py           # Run all Tier 3 enrichments
│   │   └── embed_bills.py           # Generate/update bill embeddings
│   └── pyproject.toml
│
├── shared/
│   └── openapi/                      # Generated OpenAPI schema + TS types
│
├── infra/
│   ├── docker/                       # Dockerfiles for api + pipeline
│   ├── render/                       # Render configs (render.yaml)
│   └── github-actions/               # CI/CD workflow templates
│
├── pnpm-workspace.yaml
└── README.md
```

### Shared SQLAlchemy models

`apps/api/app/db/models/` is the single source of truth for SQLAlchemy models. The pipeline imports from it via a relative path or a small shared package. No duplication.

### Model storage for vote prediction

Serialized scikit-learn models (~50KB each) are stored in `ops.ml_models` as `bytea` in Postgres. This trades slightly unusual storage for zero file-system dependency on Render — the FastAPI service loads models from DB at startup, no volume mount or artifact store needed. For models this small, the tradeoff is worth it.

---

## 4. Database Schema

All tables organized into Postgres schemas by domain. Every ML output table includes `model_version`, `created_at`, and `confidence`/`score` where applicable.

### 4.1 `congress` — Legislative data

```sql
CREATE SCHEMA congress;

-- Core bill record
CREATE TABLE congress.bills (
    bill_id         text PRIMARY KEY,          -- e.g. '119-hr-4521'
    congress        integer NOT NULL,
    bill_type       text NOT NULL,             -- hr, s, hjres, sjres, etc.
    bill_number     text,                      -- e.g. 'H.R. 4521'
    title           text NOT NULL,
    summary         text,
    combined_text   text,                      -- full text when available
    status          text,                      -- introduced, passed_house, enacted, etc.
    policy_area     text,
    topics          text[] NOT NULL DEFAULT '{}',
    sponsor_bioguide_id text REFERENCES congress.legislators(bioguide_id),
    sponsor_name    text,
    sponsor_party   text,
    introduced_date date,
    last_action_text text,
    last_action_date date,
    congress_gov_url text,
    referenced_agencies text[],
    referenced_laws    text[],
    referenced_usc     text[],
    search_vector   tsvector,                  -- auto-updated by trigger
    synced_at       timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX ON congress.bills USING gin(search_vector);
CREATE INDEX ON congress.bills USING gin(title gin_trgm_ops);
CREATE INDEX ON congress.bills USING gin(topics);
CREATE INDEX ON congress.bills (congress);
CREATE INDEX ON congress.bills (status);
CREATE INDEX ON congress.bills (policy_area);

-- Trigger: auto-update search_vector on insert/update
-- Weights: title(A), summary(B), sponsor+policy+topics(C), bill_number(D)

-- Legislators
CREATE TABLE congress.legislators (
    bioguide_id     text PRIMARY KEY,
    lis_id          text UNIQUE,
    icpsr_id        integer,
    govtrack_id     text,
    thomas_id       text,
    fec_ids         text[],                    -- GIN indexed for ANY() joins
    first_name      text NOT NULL,
    last_name       text NOT NULL,
    full_name       text NOT NULL,
    party           text NOT NULL,
    chamber         text NOT NULL,             -- senate, house
    state           text NOT NULL,
    state_full      text NOT NULL,
    district        integer,
    title           text NOT NULL,             -- Sen., Rep.
    in_office       boolean DEFAULT true,
    birthday        date,
    gender          text,
    website         text,
    phone           text,
    address         text,
    photo_url       text,
    term_start      date,
    term_end        date,
    senate_class    integer,
    next_election   integer,
    twitter         text,
    facebook        text,
    youtube         text,
    fec_committee_id text,
    raw_json        jsonb,
    synced_at       timestamptz DEFAULT now()
);

CREATE INDEX ON congress.legislators USING gin(fec_ids);
CREATE INDEX ON congress.legislators (chamber);
CREATE INDEX ON congress.legislators (state);
CREATE INDEX ON congress.legislators (party);

-- Vote summaries (one per roll call)
CREATE TABLE congress.bill_vote_summaries (
    id              text PRIMARY KEY,          -- {chamber}-{congress}-{roll_call}
    bill_id         text NOT NULL,
    congress        integer NOT NULL,
    chamber         text NOT NULL,
    date            date NOT NULL,
    question        text,
    result          text NOT NULL,
    title           text,
    required        text,
    yea_total       integer DEFAULT 0,
    nay_total       integer DEFAULT 0,
    present_total   integer,
    not_voting_total integer,
    yea_democrat    integer,
    nay_democrat    integer,
    yea_republican  integer,
    nay_republican  integer,
    yea_independent integer,
    nay_independent integer,
    source_url      text,
    synced_at       timestamptz DEFAULT now()
);

CREATE INDEX ON congress.bill_vote_summaries (bill_id);
CREATE INDEX ON congress.bill_vote_summaries (date);

-- Individual vote positions
CREATE TABLE congress.bill_vote_positions (
    vote_id         text NOT NULL REFERENCES congress.bill_vote_summaries(id) ON DELETE CASCADE,
    bioguide_id     text NOT NULL REFERENCES congress.legislators(bioguide_id) ON DELETE CASCADE,
    position        text NOT NULL,             -- Yea, Nay, Not Voting, Present
    PRIMARY KEY (vote_id, bioguide_id)
);

CREATE INDEX ON congress.bill_vote_positions (bioguide_id);

-- Committees
CREATE TABLE congress.committees (
    thomas_id       text PRIMARY KEY,
    name            text NOT NULL,
    chamber         text NOT NULL,
    committee_type  text,
    parent_id       text REFERENCES congress.committees(thomas_id),
    url             text,
    synced_at       timestamptz DEFAULT now()
);

-- Committee memberships
CREATE TABLE congress.committee_memberships (
    bioguide_id     text NOT NULL REFERENCES congress.legislators(bioguide_id) ON DELETE CASCADE,
    committee_id    text NOT NULL REFERENCES congress.committees(thomas_id) ON DELETE CASCADE,
    rank            integer,
    role            text,                      -- chair, ranking_member, member
    PRIMARY KEY (bioguide_id, committee_id)
);

-- DW-NOMINATE ideology scores
CREATE TABLE congress.member_scores (
    bioguide_id     text NOT NULL REFERENCES congress.legislators(bioguide_id) ON DELETE CASCADE,
    congress        integer NOT NULL,
    nominate_dim1   real,
    nominate_dim2   real,
    synced_at       timestamptz DEFAULT now(),
    PRIMARY KEY (bioguide_id, congress)
);
```

### 4.2 `fec` — Campaign finance source data

```sql
CREATE SCHEMA fec;

-- PAC-to-candidate direct contributions
CREATE TABLE fec.pac_to_candidate (
    sub_id          bigint PRIMARY KEY,
    cmte_id         text NOT NULL,
    cand_id         text,
    transaction_tp  text,
    transaction_amt numeric(12,2),
    transaction_dt  text,
    cycle           smallint NOT NULL
);

CREATE INDEX ON fec.pac_to_candidate (cmte_id);
CREATE INDEX ON fec.pac_to_candidate (cand_id);
CREATE INDEX ON fec.pac_to_candidate (cycle);

-- Independent expenditures (Super PAC spending)
CREATE TABLE fec.independent_expenditures (
    sub_id          bigint PRIMARY KEY,
    cmte_id         text NOT NULL,
    cand_id         text,
    sup_opp         char(1) NOT NULL CHECK (sup_opp IN ('S', 'O')),
    transaction_tp  text,
    transaction_amt numeric(12,2),
    transaction_dt  text,
    cycle           smallint NOT NULL
);

CREATE INDEX ON fec.independent_expenditures (cmte_id);
CREATE INDEX ON fec.independent_expenditures (cand_id);
CREATE INDEX ON fec.independent_expenditures (cycle);

-- Committee names lookup
CREATE TABLE fec.cmte_names (
    cmte_id         text PRIMARY KEY,
    cmte_name       text NOT NULL,
    connected_org   text
);

-- FEC candidate records (supplements congress.legislators with FEC-specific data)
CREATE TABLE fec.candidates (
    cand_id         text PRIMARY KEY,
    cand_name       text NOT NULL,
    cand_party      text,
    cand_office     text,                      -- H, S, P
    cand_state      text,
    cand_district   text,
    cycle           smallint NOT NULL
);

CREATE INDEX ON fec.candidates (cycle);
```

### 4.3 `enrichment` — ML-produced clean data (Tier 1)

```sql
CREATE SCHEMA enrichment;

-- 1a: Donor entity resolution
CREATE TABLE enrichment.donor_canonical (
    id              bigserial PRIMARY KEY,
    canonical_id    text NOT NULL,             -- assigned cluster ID
    contribution_id bigint NOT NULL,           -- FEC sub_id from individual contributions (source: local Parquet)
    raw_name        text,
    raw_employer    text,
    raw_address     text,
    confidence      real NOT NULL,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON enrichment.donor_canonical (canonical_id);
CREATE INDEX ON enrichment.donor_canonical (model_version);

-- 1b: Employer normalization
CREATE TABLE enrichment.employer_canonical (
    id              bigserial PRIMARY KEY,
    canonical_employer_id text NOT NULL,
    raw_string      text NOT NULL,
    canonical_name  text NOT NULL,
    confidence      real NOT NULL,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON enrichment.employer_canonical (canonical_employer_id);
CREATE INDEX ON enrichment.employer_canonical (raw_string);

-- 1c: Industry classification
CREATE TABLE enrichment.employer_industry (
    id              bigserial PRIMARY KEY,
    canonical_employer_id text NOT NULL,
    industry        text NOT NULL,             -- ~20 buckets aligned with OpenSecrets
    sub_industry    text,                      -- optional finer granularity
    confidence      real NOT NULL,
    model_version   text NOT NULL,
    classified_at   timestamptz DEFAULT now()
);

CREATE INDEX ON enrichment.employer_industry (canonical_employer_id);
CREATE INDEX ON enrichment.employer_industry (industry);

-- 1d: Address standardization + geocoding
CREATE TABLE enrichment.donor_address_normalized (
    id              bigserial PRIMARY KEY,
    contribution_id bigint NOT NULL,
    street          text,
    city            text,
    state           text,
    zip5            text,
    zip4            text,
    lat             real,
    lon             real,
    geocode_confidence real,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON enrichment.donor_address_normalized (zip5);
CREATE INDEX ON enrichment.donor_address_normalized (state);

-- Bill embeddings for semantic search
CREATE TABLE enrichment.bill_embeddings (
    bill_id         text PRIMARY KEY REFERENCES congress.bills(bill_id) ON DELETE CASCADE,
    embedding       vector(384) NOT NULL,      -- all-MiniLM-L6-v2 output dimension
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

-- HNSW index for approximate nearest neighbor
CREATE INDEX ON enrichment.bill_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
```

### 4.4 `analytics` — Pattern detection (Tier 2)

```sql
CREATE SCHEMA analytics;

-- 2a: Donor behavioral clusters
CREATE TABLE analytics.donor_cluster (
    id              bigserial PRIMARY KEY,
    canonical_donor_id text NOT NULL,
    cluster_id      integer NOT NULL,
    cluster_label   text,                      -- human-assigned label
    distance_to_centroid real,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON analytics.donor_cluster (canonical_donor_id);
CREATE INDEX ON analytics.donor_cluster (cluster_id);

-- 2c: Network community detection
CREATE TABLE analytics.entity_community (
    id              bigserial PRIMARY KEY,
    entity_id       text NOT NULL,
    entity_type     text NOT NULL,             -- donor, committee, candidate
    community_id    integer NOT NULL,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON analytics.entity_community (entity_id, entity_type);
CREATE INDEX ON analytics.entity_community (community_id);

-- 2c: Entity centrality scores
CREATE TABLE analytics.entity_centrality (
    id              bigserial PRIMARY KEY,
    entity_id       text NOT NULL,
    entity_type     text NOT NULL,
    pagerank        real,
    betweenness     real,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON analytics.entity_centrality (entity_id, entity_type);

-- 2b: Bundler detection
CREATE TABLE analytics.bundling_events (
    id              bigserial PRIMARY KEY,
    committee_id    text NOT NULL,
    event_date      date NOT NULL,
    donor_count     integer NOT NULL,
    total_amount    numeric(12,2),
    signals         jsonb NOT NULL,            -- which signals fired
    confidence      real NOT NULL,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON analytics.bundling_events (committee_id);

-- 2d: Money flow attribution
CREATE TABLE analytics.money_flow_attribution (
    id              bigserial PRIMARY KEY,
    destination_committee_id text NOT NULL,
    origin_entity_id text NOT NULL,
    origin_entity_type text NOT NULL,          -- donor, pac, party
    attributed_amount numeric(12,2) NOT NULL,
    hop_count       integer NOT NULL,
    path            text[],                    -- ordered committee IDs in chain
    cycle           smallint NOT NULL,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON analytics.money_flow_attribution (destination_committee_id);
CREATE INDEX ON analytics.money_flow_attribution (origin_entity_id);
```

### 4.5 `anomalies` — Flagged patterns (Tier 3)

```sql
CREATE SCHEMA anomalies;

-- 3a: Suspicious contribution clusters (straw donor signals)
CREATE TABLE anomalies.suspicious_contribution_events (
    id              bigserial PRIMARY KEY,
    committee_id    text NOT NULL,
    event_date      date NOT NULL,
    donor_count     integer NOT NULL,
    total_amount    numeric(12,2),
    signals         jsonb NOT NULL,
    score           real NOT NULL,
    confidence      real NOT NULL,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON anomalies.suspicious_contribution_events (committee_id);
CREATE INDEX ON anomalies.suspicious_contribution_events (score);

-- 3b: Committee behavioral change points
CREATE TABLE anomalies.committee_change_points (
    id              bigserial PRIMARY KEY,
    committee_id    text NOT NULL,
    change_date     date NOT NULL,
    metric          text NOT NULL,             -- party_split, spend_rate, recipient_profile
    magnitude       real NOT NULL,
    direction       text,                      -- increase, decrease, shift
    confidence      real NOT NULL,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON anomalies.committee_change_points (committee_id);

-- 3c: Geographic anomalies
CREATE TABLE anomalies.geographic_anomalies (
    id              bigserial PRIMARY KEY,
    contribution_id bigint NOT NULL,
    canonical_donor_id text,
    anomaly_score   real NOT NULL,
    donor_center_distance_km real,
    employer_distance_km real,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

-- 3d: Amount distribution anomalies
CREATE TABLE anomalies.amount_distribution_anomalies (
    id              bigserial PRIMARY KEY,
    committee_id    text NOT NULL,
    anomaly_type    text NOT NULL,             -- limit_clustering, repeated_amount, round_number
    magnitude       real NOT NULL,
    examples        jsonb,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);
```

### 4.6 `app` — User-facing data

```sql
CREATE SCHEMA app;

CREATE TABLE app.profiles (
    id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name    text,
    avatar_url      text,
    activity_last_seen_at timestamptz,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE app.followed_politicians (
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    politician_id   text NOT NULL REFERENCES congress.legislators(bioguide_id),
    created_at      timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, politician_id)
);

CREATE TABLE app.tracked_bills (
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    bill_id         text NOT NULL REFERENCES congress.bills(bill_id),
    created_at      timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, bill_id)
);

CREATE TABLE app.topic_preferences (
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    topic           text NOT NULL,
    created_at      timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, topic)
);
```

### 4.7 `derived` — Pipeline-computed aggregations

```sql
CREATE SCHEMA derived;

CREATE TABLE derived.legislator_funding_summary (
    bioguide_id     text NOT NULL REFERENCES congress.legislators(bioguide_id) ON DELETE CASCADE,
    cycle           smallint NOT NULL,
    pac_direct_total numeric(12,2) DEFAULT 0,
    large_donor_total numeric(12,2) DEFAULT 0,
    small_donor_total numeric(12,2) DEFAULT 0,
    superpac_ie_for  numeric(12,2) DEFAULT 0,
    superpac_ie_against numeric(12,2) DEFAULT 0,
    in_state_total   numeric(12,2) DEFAULT 0,
    out_of_state_total numeric(12,2) DEFAULT 0,
    computed_at      timestamptz DEFAULT now(),
    PRIMARY KEY (bioguide_id, cycle)
);

CREATE TABLE derived.legislator_top_pacs (
    bioguide_id     text NOT NULL REFERENCES congress.legislators(bioguide_id) ON DELETE CASCADE,
    cycle           smallint NOT NULL,
    cmte_id         text NOT NULL,
    cmte_name       text,
    industry        text,
    direct_contribution numeric(12,2) DEFAULT 0,
    ie_for          numeric(12,2) DEFAULT 0,
    ie_against      numeric(12,2) DEFAULT 0,
    total_support   numeric(12,2) DEFAULT 0,
    rank            integer,
    PRIMARY KEY (bioguide_id, cycle, cmte_id)
);

CREATE TABLE derived.legislator_top_contributors (
    bioguide_id     text NOT NULL REFERENCES congress.legislators(bioguide_id) ON DELETE CASCADE,
    cycle           smallint NOT NULL,
    org_name        text NOT NULL,
    individual_total numeric(12,2) DEFAULT 0,
    pac_total       numeric(12,2) DEFAULT 0,
    grand_total     numeric(12,2) DEFAULT 0,
    rank            integer,
    PRIMARY KEY (bioguide_id, cycle, org_name)
);

CREATE TABLE derived.contributor_leaderboard_cache (
    cmte_id         text PRIMARY KEY,
    cmte_name       text NOT NULL,
    direct_total    numeric(12,2) DEFAULT 0,
    ie_for_total    numeric(12,2) DEFAULT 0,
    ie_against_total numeric(12,2) DEFAULT 0,
    total_contributions numeric(12,2) DEFAULT 0,
    recipient_count integer DEFAULT 0,
    top_recipients  jsonb,                     -- array of top 5 with amounts
    computed_at     timestamptz DEFAULT now()
);

CREATE INDEX ON derived.contributor_leaderboard_cache (total_contributions DESC);
CREATE INDEX ON derived.contributor_leaderboard_cache USING gin(cmte_name gin_trgm_ops);
```

### 4.8 `ops` — Pipeline operations

```sql
CREATE SCHEMA ops;

CREATE TABLE ops.pipeline_runs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    script_name     text NOT NULL,
    started_at      timestamptz DEFAULT now(),
    finished_at     timestamptz,
    status          text NOT NULL DEFAULT 'running', -- running, success, failed
    rows_processed  integer DEFAULT 0,
    rows_skipped    integer DEFAULT 0,
    errors          integer DEFAULT 0,
    watermark       timestamptz,               -- for incremental sync
    metadata        jsonb,
    error_detail    text
);

CREATE INDEX ON ops.pipeline_runs (script_name, started_at DESC);

CREATE TABLE ops.bulk_import_checkpoints (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    script          text NOT NULL,
    source_file     text NOT NULL,
    chunk_index     integer NOT NULL,
    status          text DEFAULT 'completed',
    created_at      timestamptz DEFAULT now(),
    UNIQUE (script, source_file, chunk_index)
);

-- Manual override tables (pipeline respects these)
CREATE TABLE ops.donor_overrides (
    id              bigserial PRIMARY KEY,
    canonical_id_from text NOT NULL,           -- wrong canonical ID
    canonical_id_to   text NOT NULL,           -- correct canonical ID
    reason          text,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE ops.employer_overrides (
    id              bigserial PRIMARY KEY,
    raw_string      text NOT NULL,
    correct_canonical_employer_id text NOT NULL,
    reason          text,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE ops.industry_overrides (
    id              bigserial PRIMARY KEY,
    canonical_employer_id text NOT NULL,
    correct_industry text NOT NULL,
    reason          text,
    created_at      timestamptz DEFAULT now()
);
```

---

## 5. Auth Flow

1. User signs in via Supabase JS client in the SPA
2. Supabase stores session in localStorage, auto-refreshes access token
3. Every API request includes `Authorization: Bearer <access_token>` (added by `openapi-fetch` middleware)
4. FastAPI `get_current_user` dependency:
   - Extracts JWT from header
   - Fetches Supabase JWKS (cached with TTL)
   - Validates signature, expiry, audience
   - Returns user ID (or raises 401)
5. Protected endpoints: `current_user: User = Depends(get_current_user)`
6. TanStack Router `beforeLoad` on protected routes checks Supabase session, redirects to `/login` if missing

No middleware, no SSR auth refresh, no cookie management.

---

## 6. Hybrid Search (3-signal RRF)

The existing 2-signal hybrid search (FTS + trigram) is extended with semantic similarity as a third signal.

### Query-time flow

1. User submits search query string
2. FastAPI embeds the query with `all-MiniLM-L6-v2` (loaded once at startup, ~80MB, ~50ms/query)
3. Three parallel sub-queries run against Postgres:
   - **FTS**: `websearch_to_tsquery()` against `congress.bills.search_vector`, ranked by `ts_rank_cd()`
   - **Trigram**: `similarity()` against `congress.bills.title`, threshold > 0.1
   - **Semantic**: cosine similarity against `enrichment.bill_embeddings.embedding`, top K nearest
4. Results fused with Reciprocal Rank Fusion:
   ```
   score = w1/(k + fts_rank) + w2/(k + trigram_rank) + w3/(k + semantic_rank)
   ```
   where `k = 60`, `w1 = 1.0`, `w2 = 0.5`, `w3 = 0.8` (tunable)
5. Return top 20 results by RRF score

### Embedding pipeline

- Bill embeddings generated during pipeline load step (Phase 1)
- Input: concatenation of `title + ' ' + summary` (truncated to model max tokens)
- Model: `all-MiniLM-L6-v2` (384 dimensions, CPU-friendly)
- Stored in `enrichment.bill_embeddings` with HNSW index
- Re-embedded on bill update (title or summary changes)

---

## 7. OpenAPI Codegen

1. FastAPI auto-generates `/openapi.json` from Pydantic models
2. `pnpm codegen` in `apps/web`:
   - Curls `http://localhost:8000/openapi.json`
   - Runs `openapi-typescript` to produce `src/lib/api/generated/schema.ts`
3. `apps/web/src/lib/api/client.ts` exports typed client via `openapi-fetch<paths>`
4. Run manually after backend changes, or wire to pre-commit hook

---

## 8. Observability

### Error tracking (Sentry)

Three Sentry projects, one organization:
- `beyond-the-ballot-web` — `@sentry/react` in `main.tsx`, source map upload via Vite plugin
- `beyond-the-ballot-api` — `sentry-sdk[fastapi]` in `main.py`, tags with user ID from JWT
- `beyond-the-ballot-pipeline` — `sentry-sdk` at entry point, wraps each stage with try/except

### Structured logging (structlog)

**FastAPI:** JSON output with fields: `timestamp`, `level`, `service`, `event`, `request_id`, `user_id`, `route`, `method`, `status_code`, `duration_ms`

**Pipeline:** JSON output with fields: `timestamp`, `level`, `service`, `event`, `job_name`, `job_run_id`, `stage`, `rows_processed`, `rows_skipped`, `errors`, `duration_ms`

**Development:** Pretty-printed via `ConsoleRenderer`. **Production:** JSON to stdout, captured by Render/Fly logs.

### Request tracing

Every FastAPI request gets a `request_id` (UUID4):
- Generated in middleware at request entry
- Added to context var for all logs in that request
- Returned in `X-Request-ID` response header
- SPA logs request ID in Sentry breadcrumbs

### Health check

`GET /healthz` performs a real DB check (`SELECT 1`) with short timeout. Returns 200 if DB reachable, 503 with detail if not.

### Uptime monitoring

Better Uptime or UptimeRobot (free tier):
- Check `GET /healthz` on FastAPI every minute
- Check SPA homepage every minute
- Alert on email or Slack

### Data freshness

- Every pipeline run writes to `ops.pipeline_runs`
- `GET /internal/data-freshness` returns most recent successful run per job
- Alert if any job is >36 hours stale

---

## 9. ML Enrichment Details

### Tier 1: Data cleaning (foundation)

| Step | Input | Method | Output table | Cost |
|------|-------|--------|-------------|------|
| 1a Donor resolution | Local Parquet (individual contributions) | Block on (last_name_3, zip5), embed with MiniLM, agglomerative clustering (cosine threshold ~0.15) | `enrichment.donor_canonical` | Free |
| 1b Employer normalization | Unique employer strings from Parquet | Embed with MiniLM, HDBSCAN clustering, pick canonical name per cluster | `enrichment.employer_canonical` | Free |
| 1c Industry classification | Canonical employer names from 1b | Batch LLM API (~200K unique employers), ~20 industry buckets | `enrichment.employer_industry` | $20-50 one-time |
| 1d Address standardization | Raw addresses from Parquet | `usaddress` parsing + Census batch geocoder | `enrichment.donor_address_normalized` | Free |

Stopword handling: "Self-employed", "Retired", "N/A", "Not Employed" flagged as non-employers before clustering.

Confidence thresholds for UI:
- High (>0.85): show enriched data normally
- Medium (0.5-0.85): show with "best guess" indicator
- Low (<0.5): show "not classified"

### Tier 2: Pattern detection

| Step | Input | Method | Output table |
|------|-------|--------|-------------|
| 2a Donor clustering | Canonical donor feature vectors (total $, party split, recipient types, temporal, geographic) | UMAP reduction → HDBSCAN, expect 10-30 clusters | `analytics.donor_cluster` |
| 2d Money flow | PAC-to-PAC chains in FEC data | SQL graph traversal, weighted attribution at each hop | `analytics.money_flow_attribution` |

### Tier 3: Anomaly detection (research mode)

| Step | Method | Output table |
|------|--------|-------------|
| 3a Suspicious clusters | Rules-based scoring (first-time donors, same-day clusters, employer/address overlap) + optional Isolation Forest | `anomalies.suspicious_contribution_events` |
| 3b Change detection | Monthly time series per committee, PELT change-point detection via `ruptures` | `anomalies.committee_change_points` |

All Tier 3 outputs behind "research mode" UI boundary. Always link to source filings. Never assert wrongdoing.

### ML-powered API features

These endpoints justify FastAPI as the backend — they require Python ML libraries at request time and are impractical in a Node.js API layer.

**Donor similarity** — `GET /api/donors/{canonical_donor_id}/similar`
- Input: a canonical donor ID
- Method: look up the donor's feature vector from `analytics.donor_cluster`, query nearest neighbors by cosine distance in the same embedding space
- Returns: top N similar donors with distance scores, shared characteristics (same cluster, overlapping recipients, similar amounts)
- Depends on: Tier 2a donor clustering (Phase 4)
- Implementation: precomputed donor embeddings stored in pgvector, nearest-neighbor lookup via HNSW index

**Legislator funding comparison** — `GET /api/legislators/{bioguide_id}/funding-comparison`
- Input: a legislator's bioguide ID + optional comparison scope (`state`, `party`, `chamber`, or specific bioguide IDs)
- Method: pull funding summaries from `derived.legislator_funding_summary` + industry breakdowns from `enrichment.employer_industry`, compute percentile ranks within the comparison group
- Returns: structured comparison with percentiles (e.g., "receives more PAC money than 83% of Senate Democrats"), industry concentration index, notable outlier industries
- Depends on: Tier 1c industry classification (Phase 2) + derived funding tables
- Implementation: SQL aggregation with percentile_cont window functions, structured into Pydantic response

**Voting pattern prediction** — `GET /api/legislators/{bioguide_id}/vote-prediction?bill_id={bill_id}`
- Input: legislator bioguide ID + bill ID
- Method: lightweight logistic regression trained on historical votes, using features: NOMINATE dim1/dim2 scores, bill topic, sponsor party, committee membership overlap with bill's committee
- Training: batch job in pipeline, model serialized via joblib, loaded at FastAPI startup
- Returns: predicted vote (Yea/Nay) with probability, top contributing features, historical accuracy for this legislator on similar bills
- Depends on: `congress.member_scores`, `congress.bill_vote_positions`, bill topic data
- Implementation: scikit-learn `LogisticRegression` trained per-congress, ~50KB serialized model per congress. Retrain in pipeline when new votes are ingested.
- Risk: predictions are probabilistic, not assertions. UI must frame as "based on voting history" with confidence intervals.

**Follow the money** — `GET /api/money-flow/{entity_id}?direction={inbound|outbound}&depth={1-5}`
- Input: a donor, PAC, or candidate entity ID + traversal direction + max hops
- Method: graph traversal through PAC-to-PAC and PAC-to-candidate chains using precomputed `analytics.money_flow_attribution` data, with optional live traversal via networkx for paths not yet materialized
- Returns: directed acyclic graph of money flow with amounts, hop counts, and attribution weights at each node. Includes industry labels from `enrichment.employer_industry` at origin nodes.
- Depends on: Tier 2d money flow tracing (Phase 4)
- Implementation: primary path reads from materialized `money_flow_attribution` table. For ad-hoc queries beyond materialized depth, falls back to networkx graph loaded from FEC PAC-to-PAC transfers. Response is a JSON graph (nodes + edges) suitable for frontend visualization.

### Schema additions for ML-powered features

```sql
-- Donor feature vectors for similarity search (computed in Tier 2a pipeline)
CREATE TABLE analytics.donor_feature_vectors (
    canonical_donor_id text PRIMARY KEY,
    embedding       vector(64) NOT NULL,       -- UMAP-reduced feature vector
    total_amount    numeric(12,2),
    contribution_count integer,
    party_split_d   real,                      -- % to Democrats
    party_split_r   real,                      -- % to Republicans
    recipient_type_candidate real,             -- % to candidates
    recipient_type_pac real,                   -- % to PACs
    geographic_spread real,                    -- entropy of recipient states
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON analytics.donor_feature_vectors
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Serialized ML models for vote prediction
CREATE TABLE ops.ml_models (
    id              bigserial PRIMARY KEY,
    model_name      text NOT NULL,             -- e.g. 'vote_prediction_119'
    congress        integer,
    model_bytes     bytea NOT NULL,            -- joblib-serialized model
    accuracy        real,                      -- cross-validated accuracy
    feature_names   text[],
    trained_at      timestamptz DEFAULT now(),
    model_version   text NOT NULL
);

CREATE UNIQUE INDEX ON ops.ml_models (model_name, congress);
```

### Phase mapping for ML-powered features

| Feature | Depends on | Lands in |
|---------|-----------|----------|
| Donor similarity | Tier 2a donor clustering + donor feature vectors | Phase 4 (pipeline computes vectors + FastAPI endpoint) |
| Funding comparison | Tier 1c industry classification + derived tables | Phase 3 (endpoint, data already available after Phase 2) |
| Vote prediction | NOMINATE scores + vote history (existing data) | Phase 3 (train in pipeline, serve in FastAPI) |
| Follow the money | Tier 2d money flow + networkx | Phase 4 (pipeline materializes flows + FastAPI endpoint) |

---

## 10. What's Being Removed

- `middleware.ts` (auth session refresh + rate limiting)
- `app/**/page.tsx` thin-shim pattern
- All Next.js route handlers (`app/api/`)
- All server components and server actions
- Three Supabase client tiers (browser/server/service) — kept only for auth in SPA
- Direct Postgres access from frontend (`postgres` package, `lib/db.ts`)
- `supabase/migrations/` as schema source of truth (→ Alembic)
- Custom Congress.gov API client code in pipeline
- `next/font` (→ self-hosted or CDN fonts in Vite)

## 11. What's Being Kept

- All React components in `components/` (ported to Vite, structure preserved)
- Tailwind 4 + Lucide design system
- TypeScript strict mode
- Vitest + RTL + Playwright
- Hybrid search SQL logic (extended with semantic signal)
- Topic classification logic (moves into pipeline loader)
- Feature-organized component folders
- Supabase Auth flows (JS client side only)
- FEC data processing logic (adapted to Parquet + new schema)
- DuckDB for local analytics

---

## 12. Phase Summary

| Phase | Focus | Key deliverables |
|-------|-------|------------------|
| 0 | Scaffold | Monorepo structure, empty FastAPI + Vite projects, Supabase auth verified |
| 1 | Pipeline rewrite | usc-run ingest, congress-legislators sync, FEC → Parquet, bill embeddings, new schema, observability |
| 2 | ML Tier 1 | Donor resolution, employer normalization, industry classification, address standardization |
| 3 | FastAPI backend | SQLAlchemy models, Alembic migrations, all API endpoints, hybrid search, auth, observability, vote prediction model, funding comparison endpoint, deploy to Render |
| 4 | ML Tier 2 | Donor behavioral clusters, donor feature vectors, money flow tracing, donor similarity endpoint, follow-the-money endpoint |
| 5 | Vite SPA | Port all pages, TanStack Router/Query, openapi-fetch, Sentry, deploy to Vercel |
| 6 | Cut over | DNS switch, delete Next.js, decommission old deployment |
| 7 | ML Tier 3 | Suspicious clusters, change detection, research mode UI |

---

## 13. Cost Summary

| Item | Cost |
|------|------|
| Supabase (Postgres + Auth) | Free tier or $25/mo Pro |
| Vercel (static SPA) | Free |
| Render (FastAPI) | $7-15/mo |
| Sentry | Free (5K errors/mo) |
| Better Uptime | Free (10 monitors) |
| Better Stack/Axiom logs | Free tier |
| LLM batch enrichment (one-time) | $20-50 |
| **Steady-state total** | **<$30/mo** |

---

## 14. Risks

1. **Complex SQL migration** — Hybrid search RRF is the riskiest port. Plan a day for benchmarking with `EXPLAIN ANALYZE`.
2. **SQLAlchemy async lazy loading** — Relationship access raises in async sessions. Use `selectinload()`/`joinedload()` aggressively.
3. **CORS** — Supabase Auth tokens from Vercel domain, FastAPI on Render subdomain. Test full auth flow in Phase 0.
4. **OpenAPI codegen edge cases** — Discriminated unions and generics translate awkwardly. Budget time in Phase 3.
5. **Individual contribution volume** — ~4GB/cycle in local Parquet. Manageable on laptop but ML jobs will be slow on first run.
6. **pgvector on Supabase** — Extension must be enabled. Verify in Phase 0.
7. **Shared SQLAlchemy models** — API and pipeline must share without duplication. Solve in Phase 0.
8. **ML false positives (Tier 3)** — Requires careful UI framing. Never assert wrongdoing.
9. **Postgres `search_path` with multiple schemas** — SQLAlchemy models need explicit `__table_args__ = {"schema": "congress"}` on every model. Alembic's `include_schemas=True` and `target_metadata` must be configured for all 8 schemas. Test in Phase 0.
10. **Rate limiting** — Current Next.js middleware does per-IP rate limiting. FastAPI needs equivalent via `slowapi` (built on `limits` library). Configure in Phase 3.
