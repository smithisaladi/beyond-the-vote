# System Overview

Beyond the Ballot is a political transparency platform that tracks U.S. legislators, bills, votes, and campaign finance data. It combines data from Congress.gov, the FEC, and VoteView into a single searchable interface with ML-powered insights.

## High-Level Architecture

```
+-------------------+     +-------------------+     +-------------------+
|   Data Sources    |     |   ETL Pipeline    |     |   Neon Postgres   |
|                   |     |                   |     |                   |
| Congress.gov API  |---->| Python scripts    |---->| 8 schemas         |
| FEC bulk files    |     | ingest/transform/ |     | 40+ tables        |
| VoteView CSV      |     | load/enrich/      |     | pgvector, FTS,    |
| Legislator YAML   |     | sentence-xformers |     | trigram indexes   |
+-------------------+     +-------------------+     +-------------------+
                                                            |
                                                            v
+-------------------+     +-------------------+     +-------------------+
|   Vite SPA        |<----|   FastAPI          |<----|   ML Models       |
|                   |     |                   |     |                   |
| React 19          |     | async + asyncpg   |     | sentence-xformers |
| TanStack Router   |     | 8 routers         |     | sklearn vote pred |
| TanStack Query    |     | JWKS auth         |     | stored in DB      |
| Tailwind CSS 4    |     | structlog + Sentry|     | loaded at startup |
+-------------------+     +-------------------+     +-------------------+
        |                         |
        v                         v
+-------------------+     +-------------------+
|   Vercel          |     |   Render          |
|   (static SPA)    |     |   (Docker)        |
+-------------------+     +-------------------+
```

## Component Summary

| Component | Tech | Purpose |
|-----------|------|---------|
| **Frontend** | Vite, React 19, TypeScript | Single-page app with file-based routing |
| **API** | FastAPI, SQLAlchemy 2.0, asyncpg | Async REST API with hybrid search and ML endpoints |
| **Database** | Neon PostgreSQL | 8 domain schemas, pgvector, full-text search, trigram |
| **Pipeline** | Python, DuckDB, sentence-transformers | ETL from 4 data sources + 3-tier ML enrichment |
| **Auth** | Neon Auth (Better Auth) | JWT-based auth with EdDSA/Ed25519 via JWKS |
| **Monitoring** | Sentry, structlog | Error tracking + structured logging with request IDs |

## Data Sources

| Source | Data | Frequency | Method |
|--------|------|-----------|--------|
| **Congress.gov** | Bills, votes, actions, cosponsors | Daily (6am UTC) | `unitedstates/congress` scraper + API |
| **FEC** | PAC contributions, independent expenditures, committee names | Weekly (Sunday 7am UTC) | Bulk file download + OpenFEC API |
| **VoteView** | DW-NOMINATE ideology scores (dim1/dim2) | Weekly | CSV download |
| **congress-legislators** | Legislator bios, contact, social media | Weekly | YAML git repo |

## Request Flow

```
Browser → Vercel (static) → /api/* proxy → Render (FastAPI)
                                              ↓
                                        Neon PostgreSQL
                                              ↓
                                     Response (JSON) → Browser
```

1. User visits the SPA on Vercel
2. TanStack Query fires API requests to `/api/*`
3. In dev, Vite proxies `/api/*` to `localhost:8000`; in production, direct to Render
4. FastAPI validates JWT (if protected route), executes query, returns JSON
5. TanStack Query caches response (2min stale, 5min GC)

## Deployment Topology

| Service | Host | Plan | Health |
|---------|------|------|--------|
| Frontend SPA | Vercel | Free | N/A (static) |
| FastAPI API | Render | Starter (~$7/mo) | `GET /healthz` |
| PostgreSQL | Neon | Free/Pro | Connection pooling |
| Pipeline | GitHub Actions | Free tier | `ops.pipeline_runs` watermarks |

## Repository Layout

```
beyond-the-vote/
├── apps/
│   ├── web/                 # Vite SPA (React 19, TanStack, Tailwind 4)
│   │   ├── src/
│   │   │   ├── components/  # Feature-organized (bills/, donors/, etc.)
│   │   │   ├── routes/      # TanStack Router file-based routes
│   │   │   ├── hooks/       # TanStack Query hooks per resource
│   │   │   └── lib/         # Types, format helpers, API client, auth
│   │   └── vite.config.ts
│   └── api/                 # FastAPI backend
│       ├── app/
│       │   ├── routers/     # One router per domain
│       │   ├── queries/     # Complex SQL (hybrid search, CTEs)
│       │   ├── schemas/     # Pydantic request/response models
│       │   ├── db/models/   # SQLAlchemy ORM models
│       │   ├── ml/          # Embedding + vote prediction models
│       │   └── middleware/   # Request ID injection
│       └── tests/
├── pipeline/                # Python ETL + ML enrichment
│   ├── ingest/              # Data fetchers
│   ├── transform/           # Normalization
│   ├── load/                # DB writers
│   ├── enrich/              # 3-tier ML enrichment
│   ├── shared/              # DB utils, embeddings, DuckDB
│   └── scripts/             # Orchestration scripts
├── shared/openapi/          # Generated OpenAPI schema
└── docs/                    # Architecture + interview docs
```

## Key Design Decisions

1. **Vite SPA over Next.js** — Migrated from Next.js to a pure Vite SPA. No SSR needed; the app is entirely client-side behind authentication. Simpler deployment, faster builds, no server-side rendering complexity.

2. **FastAPI over Express/tRPC** — Python backend shares language with the data pipeline. Async-first design with asyncpg. Auto-generated OpenAPI schema for type safety.

3. **8 Postgres schemas over separate databases** — Domain isolation without operational overhead. Cross-schema queries work natively. Single connection string.

4. **pgvector in Neon** — Semantic search embeddings stored alongside relational data. No separate vector database to manage. HNSW indexes for fast approximate nearest-neighbor.

5. **Pipeline-computed derived tables** — Heavy aggregations (funding summaries, leaderboards, top PACs) are pre-computed by the pipeline rather than calculated at query time. Balances freshness against latency.

6. **ML models stored in database** — Vote prediction models serialized as bytea in `ops.ml_models`. Zero filesystem dependency — works on ephemeral containers (Render).

7. **In-memory caching (TTLCache)** — Single-instance deployment makes in-memory caching viable. No Redis dependency. TTLs: 10min (leaderboards), 24h (contributors), 30d (AI summaries).

8. **Condensed donor entity resolution** — Individual FEC contributions (24M per cycle) are resolved into canonical donor identities (1.3M rows) using blocking + embedding clustering + cross-block merge. Stored as one row per donor, not per contribution — 95% storage reduction. See [Money Flow System](09-money-flow-system.md).

9. **All-inclusive PAC queries** — PAC leaderboard and detail queries include all candidates (presidential, challengers, retired members), not just current legislators. Independent expenditure support/oppose is tracked separately.
