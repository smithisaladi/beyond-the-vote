# Design Decisions & Production Scaling

An audit of every major design decision in the codebase — why it was made, the trade-offs accepted, and what changes at scale.

## Table of Contents

1. [Architecture Decisions](#architecture-decisions)
2. [Data Pipeline Decisions](#data-pipeline-decisions)
3. [API Layer Decisions](#api-layer-decisions)
4. [Frontend Decisions](#frontend-decisions)
5. [Scaling to Production](#scaling-to-production)
6. [Cost Analysis](#cost-analysis)
7. [CI/CD & Operations](#cicd--operations)
8. [Known Debt & Planned Improvements](#known-debt--planned-improvements)

---

## Architecture Decisions

### Vite SPA over Next.js

**Decision:** Migrated from Next.js to a pure Vite SPA.

**Defense:** The entire app is behind authentication — no public pages need SEO. SSR adds server-side rendering complexity (hydration bugs, server state management, deployment of a Node server) for zero benefit. The Vite SPA deploys as static files to Vercel's CDN, builds in ~4 seconds, and has near-instant HMR in development.

**Trade-off:** No server-side rendering means the initial page load requires downloading the full JS bundle (1.4MB gzipped to ~389KB). For an authenticated app where users return repeatedly, this is cached after first visit.

**At scale:** No change needed. Static SPA on CDN scales infinitely. The bundle size warning (>500KB) could be addressed with code splitting via dynamic `import()` on route boundaries if load times become an issue.

### FastAPI over Express/tRPC

**Decision:** Python backend instead of Node.

**Defense:** The data pipeline is Python (sentence-transformers, scikit-learn, HDBSCAN, NetworkX, DuckDB). Using Python for the API means the same ML models load natively — no cross-language model serving needed. FastAPI's async-first design with asyncpg gives excellent throughput for I/O-bound database queries. Auto-generated OpenAPI schema provides type-safe frontend consumption.

**Trade-off:** Two languages in the stack (TypeScript frontend, Python backend). No shared types between frontend and backend (mitigated by OpenAPI code generation).

**At scale:** FastAPI with uvicorn scales horizontally. Add workers with `--workers N` for CPU parallelism, or run multiple Render instances behind a load balancer.

### Single Neon PostgreSQL with 8 Schemas

**Decision:** All data in one database, organized into 8 domain schemas.

**Defense:** Cross-schema queries work natively (`congress.bills JOIN enrichment.bill_embeddings`). The hybrid search query joins across 3 schemas in a single SQL statement. Separate databases would require application-level joins or data replication. Neon provides pgvector, pg_trgm, and full-text search natively — no separate vector database or search engine needed.

**Trade-off:** Schema coupling. The pipeline writes to 6 schemas, the API reads from all 8 and writes to 1 (`app`). A single connection string means a DB outage affects everything.

**At scale:** Neon supports read replicas. Route API reads to a replica, keep writes on the primary. The 8-schema design maps cleanly to read/write routing since the API only writes to `app.*` and `derived.pac_ai_summaries`.

### pgvector over Dedicated Vector DB

**Decision:** Store embeddings in Postgres with pgvector, not Pinecone/Qdrant/Weaviate.

**Defense:** Bill embeddings (~40K vectors, 384 dimensions) and donor feature vectors (~1.3M vectors, 64 dimensions) live next to their relational data. The hybrid search query joins `congress.bills` with `enrichment.bill_embeddings` in a single query — no network round-trip to a separate service. HNSW indexes provide fast approximate nearest-neighbor search.

**Trade-off:** pgvector's HNSW is slower than purpose-built vector databases at high scale (millions of vectors). Limited vector operations compared to specialized databases.

**At scale:** At current volumes (40K bill vectors, 1.3M donor vectors), pgvector is more than adequate. If vector volume exceeds ~10M with latency-sensitive queries, evaluate migrating to a dedicated vector service. The pgvector queries are isolated in `queries/bills.py` and `routers/donor_similarity.py`, making migration straightforward.

### ML Models Stored in Database

**Decision:** Vote prediction models serialized as bytea in `ops.ml_models`, not as files.

**Defense:** Render's ephemeral filesystem means files don't persist across deploys. Storing models in the database (joblib-serialized, ~1KB each) eliminates filesystem dependency. Models load at API startup from DB, cached in memory for the process lifetime.

**Trade-off:** Sentence-transformers (~500MB) can't be stored in DB — it downloads from HuggingFace on first load and caches to disk. On Render, this means a ~20-second cold start on first deploy.

**At scale:** For more models or larger models, consider a model registry (MLflow) or object storage (S3) with download-on-startup. The current approach works for the small number of sklearn models.

### In-Memory TTLCache over Redis

**Decision:** `cachetools.TTLCache` for API response caching, no Redis.

**Defense:** Single Render instance means no cache sharing needed. TTLCache has zero latency (in-process), zero cost, and zero operational overhead. Current cache sizes are small: leaderboard (100 entries, 10min TTL), contributors (500 entries, 24h TTL), AI summaries (500 entries, 30d TTL).

**Trade-off:** Cache is lost on restart. Not shared across instances. Thundering herd on cold start.

**At scale:** Replace with Redis when running multiple API instances. Migration path is straightforward — cache keys are already well-structured tuples/strings. Upstash Redis ($10/mo) or Render Redis ($15/mo) are drop-in replacements.

---

## Data Pipeline Decisions

### Condensed Donor Schema (1 Row per Donor)

**Decision:** Store one row per canonical donor with aggregated totals, not one row per contribution.

**Defense:** 24M individual contributions per cycle would be ~4.8GB in the database. The condensed schema stores 1.29M donors (>$200 threshold) in ~370MB — a 95% reduction. Both consumers of this data (PAC top funders, donor clustering) only need donor-level aggregates.

**Trade-off:** Individual contribution traceability is lost. Can't answer "which specific $2,700 donations belong to this donor?" without re-deriving from parquet.

**At scale:** The condensed approach scales well to multiple cycles. Estimated 15M total canonical donors across all historical cycles would be ~4GB — manageable on Neon Pro.

### Blocking + Embedding Clustering for Entity Resolution

**Decision:** Group donors by `(last_name[:3], zip5)` before clustering, instead of pairwise comparison.

**Defense:** Pairwise comparison on 22M contributions is O(n²) — infeasible. Blocking reduces to ~1.26M groups, each compared internally. The fast-path optimization (exact name+employer match skips embedding) avoids 90%+ of embedding calls, cutting runtime from 6+ hours to ~100 minutes.

**Trade-off:** Blocking can split the same person across blocks if they donated from different ZIPs. The cross-block merge pass handles this but relies on heuristics (employer match, amount thresholds).

### Tiered Cross-Block Merge

**Decision:** Amount-tiered merge criteria for post-resolution deduplication.

**Defense:** At $100K+ combined, the probability of two different people with the same name is near-zero — there are maybe 500 donors at that level nationally. At $10K+, name + empty employer is sufficient. Below $10K, require employer match to avoid false merges on common names.

| Combined Amount | Merge Criteria | Rationale |
|----------------|----------------|-----------|
| $100K+ | Name match alone | Near-zero collision probability |
| $10K-$100K | Name + empty/matching employer | Distinctive enough at this level |
| < $10K | Name + employer match required | Common names need the extra signal |

**Trade-off:** Aggressive merge at high amounts could theoretically combine two different mega-donors with the same name. The risk is accepted because the use case (top funders per PAC) needs accuracy at the top, not the bottom.

### DuckDB for FEC Aggregation

**Decision:** Use DuckDB as an in-memory analytical engine for FEC bulk files, not load into Postgres.

**Defense:** FEC individual contribution files are ~4GB per cycle (58M rows for 2024). DuckDB reads Parquet files directly with constant memory, performs columnar aggregations 10-100x faster than pandas, and never writes to the database. Only the aggregated results (top funders, funding summaries) are loaded to Postgres.

**Trade-off:** Two query engines in the stack (DuckDB for pipeline, Postgres for API). DuckDB SQL syntax differs slightly from Postgres.

**At scale:** DuckDB handles multi-GB files on a single machine. For historical data (13 cycles × 4GB = 52GB), process cycles sequentially — DuckDB only holds one cycle in memory at a time.

### Pipeline Watermarking for Incremental Sync

**Decision:** Track pipeline runs in `ops.pipeline_runs` with watermark timestamps.

**Defense:** Avoids re-processing entire datasets on each run. The daily bill sync only fetches bills updated since the last successful run. The weekly FEC sync only fetches contributions since the last watermark. This makes the pipeline efficient enough to run on GitHub Actions free tier.

**Trade-off:** Watermarks use `started_at` not `finished_at` — data arriving during a long run may be missed on the next run. For daily cadence, this gap is negligible.

---

## API Layer Decisions

### All-Inclusive PAC Queries

**Decision:** PAC leaderboard and detail include all candidates, not just current legislators.

**Defense:** The original Congress-only filter hid the largest spending — Super PACs spending $100M+ on presidential candidates or challengers showed $0. Removing the filter reveals the full picture: FF PAC ($510M), MAGA Inc ($377M), America PAC ($173M).

**Trade-off:** More candidates to resolve names for. Addressed by loading `fec.candidates` table (17.7K candidates) for name resolution fallback.

### Separate IE Support/Oppose in API Responses

**Decision:** Return `direct`, `ieFor`, and `ieAgainst` separately, not a single `total`.

**Defense:** A PAC spending $40M *against* a candidate is fundamentally different from spending $40M *for* them. Collapsing into a single total hides this distinction. The frontend renders "Oppose" badges and red borders for IE-against spending.

### Graceful Degradation in Politician Detail

**Decision:** Seven independent sub-queries with per-query error handling.

**Defense:** The politician detail page assembles data from 7+ sources (profile, ideology, committees, votes, bills, funding, PACs, contributors). A failure in one (e.g., funding data not yet computed by pipeline) shouldn't break the entire page. Each sub-query is wrapped in try/except with a logged warning, and the section returns empty on failure.

**Trade-off:** Silent partial failures — the client gets a 200 with missing sections and no explicit error signal. Each exception is logged with structlog for debugging.

**At scale:** Parallelize the 7 sub-queries with `asyncio.gather()` to reduce wall time from ~35ms (serial) to ~5ms (parallel). Current serial execution is acceptable at current traffic.

---

## Frontend Decisions

### TanStack Router with File-Based Routes

**Decision:** TanStack Router over React Router v6.

**Defense:** Type-safe route params (TypeScript knows `{ id: string }` from `$id.tsx`), file-based route generation (no manual config), `beforeLoad` hooks for auth guards. The `_authenticated` layout route wraps all protected pages in auth checks without adding a URL segment.

### TanStack Query for Server State

**Decision:** No Redux, no Zustand — TanStack Query manages all server state.

**Defense:** Bills, politicians, donors, and dashboard data are all server-derived. TanStack Query provides caching (2min stale, 5min GC), automatic deduplication, background refetching, and cache invalidation on mutations. No boilerplate reducers or stores needed.

**Configuration:** `staleTime: 2min`, `gcTime: 5min`, `retry: 1`, `refetchOnWindowFocus: false`. Political data doesn't change in real-time, so aggressive refetching wastes bandwidth.

### Design System in Code, Not Documentation

**Decision:** Party colors, card styles, and typography tokens are in `lib/ui.ts`, enforced by import convention.

**Defense:** `PARTY_STYLES`, `STATUS_STYLES`, `CARD_CLASS`, and `SKELETON_BG` are the single source of truth. Components import from `@/lib/ui` — no hardcoded colors, no `text-gray-*`, no `font-bold` on body text. The design system is enforced by code review and CLAUDE.md rules, not a separate Figma file.

### SVG Curves Without D3

**Decision:** Hand-coded SVG bezier curves for the money flow visualization.

**Defense:** The requirement is 5-10 static curves connecting card elements to a center node. D3 would add ~230KB to the bundle and require imperative DOM manipulation. The entire SVG implementation is ~15 lines. Curves are computed via `useLayoutEffect` + `getBoundingClientRect()` on mount/resize.

**At scale:** If the visualization needs interaction (hover, drill-down, zoom), reach for a graph library. The current editorial approach prioritizes readability over exploration.

---

## Scaling to Production

### Current State → 10K Users

| Component | Current | Change Needed |
|-----------|---------|---------------|
| Frontend | Vercel free | None — CDN scales infinitely |
| API | Render starter (1 instance) | Upgrade to Render Standard ($25/mo) |
| Database | Neon free | Neon Pro ($19/mo) for connection limit + storage |
| Cache | In-memory TTLCache | None — single instance is fine |
| Pipeline | GitHub Actions free | None — daily/weekly cadence is sufficient |

### 10K → 100K Users

| Component | Change |
|-----------|--------|
| API | 2-3 Render instances behind load balancer ($50-75/mo) |
| Cache | **Add Redis** — replace TTLCache for shared caching ($10-15/mo) |
| Database | Add Neon read replica — route reads to replica |
| CDN | Add `Cache-Control` headers to public API endpoints |
| Search | Consider materializing the PAC leaderboard query (currently full-table scan) |

### 100K → 1M Users

| Component | Change |
|-----------|--------|
| API | 5-10 instances, auto-scaling based on CPU/request count |
| Database | Neon Pro with multiple read replicas, connection pooling via PgBouncer |
| Search | **Dedicated search service** — move hybrid bill search to OpenSearch/Elasticsearch |
| ML | **Extract model inference** — separate service for sentence-transformers (saves ~500MB per API instance) |
| CDN | Full CDN caching layer (Cloudflare/Fastly) for all public GET endpoints |
| Pipeline | Dedicated compute (Render Background Worker or AWS Lambda) instead of GitHub Actions |

### 1M+ Users

| Component | Change |
|-----------|--------|
| API | Kubernetes or serverless (AWS Lambda + API Gateway) for auto-scaling |
| Database | Self-managed Postgres on RDS with read replicas per region |
| Search | Dedicated OpenSearch cluster with cross-region replication |
| Cache | Redis Cluster for geo-distributed caching |
| Pipeline | Airflow or Dagster for orchestration, dedicated compute instances |
| CDN | Multi-region CDN with edge caching and stale-while-revalidate |
| Monitoring | Full observability stack (Datadog/Grafana + PagerDuty alerting) |

### Critical Scaling Bottlenecks (Priority Order)

1. **PAC leaderboard query** — Full-table aggregation over `fec.pac_to_candidate` + `fec.independent_expenditures` on every uncached request. Fix: materialize into `derived.contributor_leaderboard_cache` (table exists but is empty).

2. **Politician detail serial queries** — 7 sequential DB round-trips. Fix: `asyncio.gather()` for parallel execution.

3. **In-memory cache divergence** — Multiple instances = different caches. Fix: Redis.

4. **Sentence-transformers memory** — ~500MB per API instance. Fix: separate inference service or lazy loading.

5. **Connection pool exhaustion** — 15 max connections shared across all requests. Fix: increase `pool_size` and use Neon's PgBouncer endpoint.

---

## Cost Analysis

### Current (Development)

| Service | Plan | Cost |
|---------|------|------|
| Vercel | Free | $0 |
| Render | Starter | $7/mo |
| Neon | Free | $0 |
| GitHub Actions | Free tier | $0 |
| Sentry | Free tier | $0 |
| **Total** | | **$7/mo** |

### Production (10K-100K users)

| Service | Plan | Cost |
|---------|------|------|
| Vercel | Pro | $20/mo |
| Render | Standard × 2 | $50/mo |
| Neon | Pro (10GB) | $19/mo |
| Redis | Upstash | $10/mo |
| Sentry | Team | $26/mo |
| GitHub Actions | Free tier | $0 |
| Anthropic API | Pay-per-use | ~$20/mo |
| **Total** | | **~$145/mo** |

### Production (1M+ users)

| Service | Plan | Cost |
|---------|------|------|
| Vercel | Enterprise | $150/mo |
| AWS (API + compute) | ECS/Lambda | ~$500/mo |
| RDS (Postgres) | db.r6g.large + replica | ~$400/mo |
| OpenSearch | m5.large.search | ~$200/mo |
| Redis | ElastiCache r6g.large | ~$150/mo |
| CloudFront CDN | Standard | ~$50/mo |
| Monitoring | Datadog Pro | ~$200/mo |
| **Total** | | **~$1,650/mo** |

---

## CI/CD & Operations

### Current Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Actions                            │
│                                                             │
│  test.yml          pipeline-ci.yml    sync-daily.yml        │
│  ├─ lint           ├─ pytest          ├─ bills              │
│  ├─ unit tests     └─ (on pipeline    ├─ votes              │
│  ├─ e2e (Playwright)   changes)       └─ embeddings         │
│  └─ pipeline tests                                          │
│                                        sync-weekly.yml      │
│  Triggers:                             ├─ legislators       │
│  ├─ PR / push to main                 ├─ VoteView scores   │
│  └─ merge to main                     ├─ FEC API           │
│                                        ├─ funding summaries │
│                                        └─ employer enrichment│
└─────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
   Vercel (auto)        Render (auto)        Neon (always on)
   deploy on push       deploy on push
   to main              to main
```

### What's Automated

| Task | Schedule | Method |
|------|----------|--------|
| Frontend deploy | On push to main | Vercel auto-deploy |
| API deploy | On push to main | Render auto-deploy |
| Bill + vote sync | 6am UTC weekdays | GitHub Actions cron |
| FEC + legislator sync | 7am UTC Sundays | GitHub Actions cron |
| Lint + test | On PR | GitHub Actions |
| Pipeline tests | On pipeline changes | GitHub Actions |

### What's NOT Automated (Manual Steps)

| Task | Current Process | Should Be |
|------|----------------|-----------|
| Database migrations | Manual `CREATE TABLE` | Alembic migration in CI/CD |
| Donor resolution (Tier 1) | Manual `uv run python -m scripts.enrich_tier1` | Weekly cron or post-FEC-sync trigger |
| Donor clustering (Tier 2) | Manual | Monthly cron |
| Money flow computation | Manual | Post-FEC-sync trigger |
| PAC top funders | Manual | Post-enrichment trigger |
| Anomaly detection (Tier 3) | Manual | Monthly cron |
| AI summary regeneration | On-demand (user clicks) | Could pre-generate for top 100 PACs |

### Recommended Production CI/CD

```yaml
# .github/workflows/deploy.yml (new)
on:
  push:
    branches: [main]

jobs:
  test:
    # ... existing test suite

  migrate:
    needs: test
    # Run Alembic migrations against production DB

  deploy-api:
    needs: migrate
    # Render auto-deploys, but could add smoke test here

  deploy-web:
    needs: test
    # Vercel auto-deploys

# .github/workflows/enrichment.yml (new)
on:
  workflow_run:
    workflows: ["Weekly Sync"]
    types: [completed]

jobs:
  enrich:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    steps:
      - run: uv run python -m scripts.enrich_tier1 --cycles 2026
      - run: uv run python -m scripts.enrich_tier2 --cycles 2026
      - run: uv run python -m scripts.compute_pac_top_funders --cycles 2026
```

### Monitoring & Alerting

| Metric | Tool | Alert |
|--------|------|-------|
| API error rate | Sentry | > 5% for 5 min → P0 page |
| API latency p95 | Sentry Performance | > 2s → P1 |
| Pipeline failures | `ops.pipeline_runs` + Slack webhook | 2x consecutive failure → P1 |
| DB connection pool | structlog metrics | > 80% utilization → P2 |
| JWKS fetch failure | structlog | Any failure → P2 (auth degraded) |
| Disk usage (Neon) | Neon dashboard | > 80% storage → P2 |
| FEC data freshness | Watermark age | > 14 days since last sync → P2 |

---

## Known Debt & Planned Improvements

### Short-Term (Before Production)

1. **Populate `derived.contributor_leaderboard_cache`** — The table exists but is empty. The PAC leaderboard query does a full-table scan every uncached request. Pre-computing this saves the heaviest API query.

2. **Run 2024 cycle enrichment** — Only 2026 cycle has been processed. Running 2024 would double the donor resolution data and capture the full election cycle.

3. **Alembic migrations** — Schema changes are currently manual DDL. Set up Alembic autogenerate from SQLAlchemy models.

4. **Add `.env.example` files** — New developers have no reference for required environment variables.

### Medium-Term (Post-Launch)

5. **Employer alias table** — "SPACEX" and "SPACE EXPLORATION TECHNOLOGIES CORP." refer to the same company but don't match via substring. A curated alias table for top employers would improve donor merging.

6. **Compute real `party_split` and `recipient_type` for donor clustering** — Currently hardcoded placeholders. Requires joining canonical donors with their contribution targets' party affiliations.

7. **`asyncio.gather` for politician detail** — Parallelize the 7 sub-queries for faster page loads.

8. **Automated enrichment pipeline** — Trigger Tier 1/2 enrichment after weekly FEC sync completes.

### Long-Term (At Scale)

9. **Dedicated search service** — Move hybrid bill search to OpenSearch when query volume exceeds what Postgres can handle.

10. **Model inference service** — Extract sentence-transformers into a sidecar or separate service to reduce API memory footprint.

11. **Real-time data** — Add SSE or WebSocket support for live vote tracking during congressional sessions.

12. **Multi-cycle donor resolution** — Process all historical FEC cycles (2000-2026) with cross-cycle donor linking.
