# Infrastructure Architecture

The full deployment topology, CI/CD pipeline, cron schedules, configuration, and operational runbook.

## Deployment Topology

```
                    ┌─────────────────────────────────────────────┐
                    │              GitHub Actions                  │
                    │                                             │
                    │  test.yml         sync-daily.yml            │
                    │  ├─ lint          ├─ bills (usc-run)        │
                    │  ├─ frontend      ├─ votes                  │
                    │  ├─ api           └─ embeddings             │
                    │  ├─ pipeline                                │
                    │  └─ typecheck     sync-weekly.yml           │
                    │                   ├─ legislators (YAML)     │
                    │  pipeline-ci.yml  ├─ VoteView (CSV)         │
                    │  └─ pytest        ├─ FEC API                │
                    │                   ├─ funding summaries      │
                    │                   └─ employer enrichment    │
                    └───────────┬───────────────┬─────────────────┘
                                │               │
                    Auto-deploy on push     Scheduled cron
                                │               │
                    ┌───────────┴───────┐       │
                    │                   │       │
              ┌─────┴─────┐     ┌──────┴──┐    │
              │  Vercel   │     │  Render  │    │
              │           │     │          │    │
              │ Vite SPA  │     │ FastAPI  │◄───┘ (DB writes)
              │ Static    │     │ Docker   │
              │ CDN       │     │ Starter  │
              │           │     │ Port 8000│
              └─────┬─────┘     └────┬─────┘
                    │                │
                    │  /api/* proxy  │
                    │  (dev only)    │
                    │                │
                    └────────┬───────┘
                             │
                    ┌────────┴────────┐
                    │ Neon PostgreSQL  │
                    │                 │
                    │ 8 schemas       │
                    │ pgvector        │
                    │ pg_trgm         │
                    │ Connection pool  │
                    │ ~1.1 GB         │
                    └─────────────────┘
```

## Services

| Service | Host | Plan | Health Check | Cost |
|---------|------|------|-------------|------|
| Frontend SPA | Vercel | Free | N/A (static CDN) | $0 |
| FastAPI API | Render | Starter | `GET /healthz` | $7/mo |
| PostgreSQL | Neon | Free/Pro | Built-in | $0-19/mo |
| CI/CD + Pipelines | GitHub Actions | Free tier | Run logs | $0 |
| Error tracking | Sentry | Free tier | Dashboard | $0 |
| **Total** | | | | **$7-26/mo** |

## Frontend (Vercel)

**Build:** `pnpm build` → Vite produces `/dist` with static assets
**Framework:** Vite (configured in `vercel.json`)
**Routing:** SPA rewrite — all paths → `/index.html`, TanStack Router handles client-side

```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

**Deploy trigger:** Auto-deploy on push to `main`
**CDN:** Vercel Edge Network (global, automatic)
**Bundle:** ~1.4 MB uncompressed, ~389 KB gzipped

## API Server (Render)

**Dockerfile:**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-dev
COPY app/ app/
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Runtime:** Python 3.11-slim, single uvicorn worker
**Deploy trigger:** Auto-deploy on push to `main` (via Render dashboard)
**Cold start:** ~20s (sentence-transformers model download on first deploy)

**Startup lifecycle:**
1. uvicorn starts
2. Lifespan hook calls `load_all_models()`
3. Sentence-transformers downloads/loads `all-MiniLM-L6-v2` (~500MB)
4. Vote prediction models loaded from `ops.ml_models` table
5. API accepts requests

**Middleware stack (applied in order):**
1. `RequestIDMiddleware` — UUID per request, `X-Request-ID` header
2. `CORSMiddleware` — Origins from `CORS_ORIGINS` env var
3. `SlowAPIMiddleware` — Rate limiting (60 req/min default)

**Connection pool:**
```python
pool_size=5          # Always-open connections
max_overflow=10      # Burst to 15 total
pool_pre_ping=True   # Verify connection before use
```

## Database (Neon PostgreSQL)

**Connection string format:**
```
postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
```

**URL transformations (in `app/config.py`):**
- `postgres://` → `postgresql+asyncpg://` (for SQLAlchemy async)
- `sslmode=require` → `ssl=require` (asyncpg compatibility)
- Strip `channel_binding=require` (asyncpg incompatibility)

**Connection modes:**
| Consumer | Driver | Mode |
|----------|--------|------|
| API | asyncpg via SQLAlchemy | Async, connection pool |
| Pipeline | psycopg2 | Sync, singleton connection, autocommit |
| Alembic | psycopg2 | Sync, direct connection |

**Neon-specific considerations:**
- Idle connections closed after ~5 min → `pool_pre_ping=True` required
- Pipeline uses `reset_conn()` before long processing to avoid idle timeout
- `get_conn()` does a liveness check (`SELECT 1`) before returning cached connection
- PgBouncer endpoint available but not currently used (would require transaction mode)

## CI/CD Workflows

### test.yml — Full Test Suite

**Trigger:** PRs + pushes to main
**Concurrency:** One per branch (cancels in-progress)

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│   Lint   │  │ Frontend │  │   API    │  │ Pipeline │  │Typecheck │
│          │  │          │  │          │  │          │  │          │
│ ESLint   │  │ Vitest   │  │ pytest   │  │ pytest   │  │ tsc      │
│          │  │ 105 tests│  │ 68 tests │  │ 248 tests│  │ --noEmit │
│          │  │ + build  │  │          │  │          │  │          │
└──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

All 5 jobs run in parallel. Total: **421 tests** across 3 languages/frameworks.

### pipeline-ci.yml — Pipeline Tests on Change

**Trigger:** Pushes/PRs touching `pipeline/**`
**Job:** `uv sync` → `pytest tests/ -v --ignore=test_integration.py`

### sync-daily.yml — Daily Data Sync

**Schedule:** `0 6 * * 1-5` (6am UTC, weekdays)
**Timeout:** 90 minutes
**Secrets:** `DATABASE_URL`

```
1. usc-run govinfo --bulkdata=BILLSTATUS --congress=119
2. usc-run bills --congress=119
3. Load bills → congress.bills (with tsvector trigger)
4. usc-run votes --congress=119
5. Load vote summaries + positions
6. Generate embeddings for new bills → enrichment.bill_embeddings
```

**Data flow:** Congress.gov bulk data → JSON → transform → upsert to DB → embed

### sync-weekly.yml — Weekly Data Sync

**Schedule:** `0 7 * * 0` (Sundays 7am UTC)
**Timeout:** 120 minutes
**Secrets:** `DATABASE_URL`, `FEC_API_KEY`

```
1. Legislators: congress-legislators YAML → congress.legislators
2. VoteView: DW-NOMINATE CSV → congress.member_scores
3. FEC API: OpenFEC → fec.pac_to_candidate + fec.independent_expenditures
   (watermark-based incremental, 950 req/hr limit)
4. Funding summaries: aggregate → derived.legislator_funding_summary
5. Employer enrichment: OpenSecrets classification → enrichment.employer_industry
```

**Error handling:** Each step runs independently. Failures are collected and reported. Partial success exits with code 1 to surface in GitHub Actions.

## Environment Variables

### API (`apps/api/.env`)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes | - | Neon PostgreSQL connection |
| `NEON_AUTH_URL` | Yes | - | Neon Auth JWKS endpoint |
| `CORS_ORIGINS` | Yes | `localhost:5173,3000` | Comma-separated allowed origins |
| `GEOCODIO_API_KEY` | Yes | - | Address → district lookup |
| `ANTHROPIC_API_KEY` | No | - | AI PAC summaries |
| `SENTRY_DSN` | No | - | Error tracking |
| `ENVIRONMENT` | No | `development` | Sentry environment |
| `DEBUG` | No | `false` | Verbose logging |
| `RATE_LIMIT` | No | `60/minute` | SlowAPI default |

### Frontend (`apps/web/.env`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_API_URL` | Yes | FastAPI base URL |
| `VITE_NEON_AUTH_URL` | Yes | Neon Auth endpoint |
| `VITE_MAPBOX_TOKEN` | No | Address autocomplete |
| `VITE_SENTRY_DSN` | No | Frontend error tracking |

### Pipeline (`pipeline/.env`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Neon PostgreSQL (psycopg2 format) |
| `FEC_API_KEY` | Weekly sync | OpenFEC API access |
| `CONGRESS_API_KEY` | No | Congress.gov API (not used by sync scripts) |

## Monitoring & Observability

### Structured Logging

**API:** structlog with JSON output in production, pretty-print in development
- Every request gets a UUID via `RequestIDMiddleware`
- Context vars bind `request_id` across all log lines in a request
- Log levels: INFO for requests, WARNING for degraded sub-queries, ERROR for failures

**Pipeline:** structlog with JSON output
- Every run tracked in `ops.pipeline_runs` with status, row counts, errors
- Watermarks enable "what was the last successful sync?" queries

### Sentry Integration

**API:** `sentry-sdk[fastapi]` — captures unhandled exceptions with request context
**Frontend:** `@sentry/react` — captures JS errors with component stack traces
**Pipeline:** `sentry-sdk` — captures pipeline failures with step context

### Health Check

```
GET /healthz → {"status": "ok"}
```

Render pings this endpoint to verify the API is running. If it returns non-200, Render restarts the container.

## Operational Runbook

### Common Tasks

| Task | Command | Where |
|------|---------|-------|
| Start dev frontend | `npm run dev` | Root |
| Start dev API | `uv run uvicorn app.main:app --reload` | `apps/api/` |
| Run frontend tests | `npm run test` | Root |
| Run API tests | `uv run pytest tests/` | `apps/api/` |
| Run pipeline tests | `uv run pytest tests/` | `pipeline/` |
| Type check frontend | `cd apps/web && npx tsc --noEmit` | Root |
| Generate migration | `uv run alembic revision --autogenerate -m "desc"` | `apps/api/` |
| Apply migrations | `uv run alembic upgrade head` | `apps/api/` |
| Check migration status | `uv run alembic current` | `apps/api/` |
| Full build | `npm run build` | Root |

### Pipeline Operations

| Task | Command | Where |
|------|---------|-------|
| Full initial import | `uv run python -m scripts.ingest_all --congress 118 119` | `pipeline/` |
| Daily sync (manual) | `uv run python -m scripts.sync_daily` | `pipeline/` |
| Weekly sync (manual) | `uv run python -m scripts.sync_weekly` | `pipeline/` |
| Donor resolution | `uv run python -m scripts.enrich_tier1 --cycles 2024,2026 --skip-geocode --skip-employer-normalization --skip-industry-classification --skip-address-standardization` | `pipeline/` |
| Donor clustering | `uv run python -m scripts.enrich_tier2` | `pipeline/` |
| Anomaly detection | `uv run python -m scripts.enrich_tier3` | `pipeline/` |
| PAC top funders | `uv run python -m scripts.compute_pac_top_funders --cycles 2024,2026` | `pipeline/` |
| Bill embeddings | `uv run python -m scripts.embed_bills` | `pipeline/` |
| Full enrichment | `uv run python -m scripts.populate_full` | `pipeline/` |

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| API 500 on search | Embedding model not loaded | Check startup logs for `load_embedding_model` failure |
| Stale PAC data | Leaderboard cache TTL | Wait 10 min or restart API |
| Empty top contributors | `_contributors_cache` TTL | Wait 24h or restart API |
| Pipeline SSL error | Neon idle timeout | `reset_conn()` is automatic; re-run the script |
| Bill search misses | Missing embeddings | Run `uv run python -m scripts.embed_bills` |
| Money flow empty | Attribution not computed | Run `uv run python -m scripts.enrich_tier2` |
| Donor data empty | Tier 1 not run | Run `enrich_tier1` (see above) |
