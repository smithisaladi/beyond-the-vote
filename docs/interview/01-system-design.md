# System Design Questions

Technical deep-dive questions about the overall system architecture, with detailed answers referencing actual implementation.

---

## Q1: Walk me through the high-level architecture. Why these technology choices?

**Answer:**

The system has four main components: a Python ETL pipeline, a Neon PostgreSQL database, a FastAPI async API, and a Vite React SPA.

**Why Python for the pipeline?** Campaign finance data processing involves heavy use of pandas-like operations, ML libraries (scikit-learn, sentence-transformers, HDBSCAN), and graph analysis (NetworkX). Python's data science ecosystem is unmatched here. Using Python for both the pipeline and backend (FastAPI) also means shared mental models — the team doesn't context-switch between languages for data work.

**Why FastAPI over Express/Node?** Three reasons: (1) Python for the ML model serving — the API loads sentence-transformers and sklearn models at startup, which would require a separate Python service if the API were Node. (2) Async-first with asyncpg gives excellent throughput for I/O-bound database queries. (3) Auto-generated OpenAPI schema enables type-safe frontend consumption.

**Why Vite SPA over Next.js?** The app was originally Next.js but migrated to a pure SPA. The entire app is behind authentication — there's no SEO benefit to SSR. A Vite SPA eliminates server-side rendering complexity, deploys as static files to Vercel, and has faster development iteration (Vite HMR is near-instant).

**Why Neon PostgreSQL?** Neon provides managed Postgres with pgvector, which enables semantic search and donor similarity queries without a separate vector database. Neon Auth (Better Auth) provides JWT-based authentication integrated with the same database. Connection pooling and auto-scaling are built in.

---

## Q2: How would you scale this system to handle 100x the current traffic?

**Answer:**

Current bottlenecks and their scaling strategies:

**1. Database reads (biggest bottleneck):**
- Add read replicas for the API. Neon supports this natively.
- The hybrid search query is the heaviest — each search touches 3 CTEs with `LIMIT 100` each. At scale, add a dedicated search service (OpenSearch/Elasticsearch) instead of running search in Postgres.
- Materialized views for the PAC leaderboard and funding aggregations (currently live-computed with CTEs).

**2. API server:**
- FastAPI with asyncpg is already non-blocking. Horizontal scaling is straightforward: run multiple Render instances behind a load balancer.
- The in-memory TTLCache breaks with multiple instances — replace with Redis for shared cache.
- ML model loading duplicates memory per instance (~500MB for sentence-transformers). At scale, extract model inference into a separate service (or use a model serving platform like Triton).

**3. Pipeline:**
- Already designed for incremental sync via watermarks. The daily/weekly GitHub Actions pattern scales to much larger data volumes.
- For real-time data, replace batch ETL with a streaming architecture: Congress.gov webhooks (if available) → message queue → stream processors.
- DuckDB handles FEC bulk files well, but at 100x individual contributions, consider moving to a proper data warehouse (BigQuery, Snowflake).

**4. Frontend:**
- Already a static SPA on Vercel CDN — infinitely scalable.
- Add API response caching at the CDN layer (Cache-Control headers) for public endpoints like bill search.

**Scaling priority order:** Read replicas → Redis cache → horizontal API scaling → dedicated search service.

---

## Q3: Why 8 database schemas instead of a single schema or separate databases?

**Answer:**

The 8-schema approach (`congress`, `fec`, `enrichment`, `analytics`, `anomalies`, `app`, `derived`, `ops`) balances isolation with operational simplicity.

**Why not a single schema?** With 40+ tables spanning raw data, ML outputs, user data, and pipeline operations, a single schema becomes unnavigable. Schema boundaries enforce a data flow direction: `congress`/`fec` (raw) → `enrichment` (cleaned) → `analytics` (patterns) → `anomalies` (flags). This makes it clear what depends on what.

**Why not separate databases?** Cross-schema queries work natively in Postgres (`FROM congress.bills JOIN enrichment.bill_embeddings`). The hybrid search query joins across `congress` and `enrichment` schemas in a single query. With separate databases, you'd need application-level joins or data replication, adding latency and complexity.

**Schema access patterns:**
- Pipeline writes to `congress`, `fec`, `enrichment`, `analytics`, `anomalies`, `derived`, `ops`
- API reads from all schemas, writes only to `app`
- This natural read/write separation could enable future read replica routing

**Trade-off:** Schema-qualified table names in SQLAlchemy (`__table_args__ = {"schema": "congress"}`) and raw SQL (`FROM congress.bills`) add verbosity. But the domain clarity is worth it.

---

## Q4: Explain the data flow from a bill being introduced in Congress to appearing in search results.

**Answer:**

**Step 1: Ingestion** (daily, 6am UTC via GitHub Actions)
- `scripts/sync_daily.py` calls `ingest/congress.py`
- Uses the `unitedstates/congress` scraper to fetch bill data from Congress.gov
- Respects the watermark: only fetches bills updated since the last successful run
- Raw JSON saved to `data/raw/`

**Step 2: Transform** (`transform/bills.py`)
- Normalizes Congress.gov JSON into the database schema format
- Extracts: bill_id, title, summary, status, policy_area, topics, sponsor info
- Derives `combined_text` = title + summary (used for embeddings later)
- Maps policy areas to our 12 topic slugs

**Step 3: Load** (`load/bills.py`)
- Uses `shared.db.upsert()` to insert/update into `congress.bills`
- The `bills_search_vector_trigger` fires on INSERT/UPDATE:
  ```sql
  search_vector = setweight(to_tsvector(title), 'A') ||
                  setweight(to_tsvector(summary), 'B') ||
                  setweight(to_tsvector(sponsor + topics), 'C') ||
                  setweight(to_tsvector(bill_number), 'D')
  ```
- The bill is now searchable via FTS

**Step 4: Embedding** (`scripts/embed_bills.py`)
- Runs after bill loading
- Generates a 384-dim embedding from `combined_text` using `all-MiniLM-L6-v2`
- Stores in `enrichment.bill_embeddings` with HNSW index
- The bill is now searchable via semantic search

**Step 5: Search** (user queries the API)
- `GET /api/bills?q=healthcare+costs`
- API embeds the query at request time
- Runs the hybrid search: FTS (weighted tsvector) + trigram (title similarity) + semantic (cosine distance)
- RRF fuses the three ranked lists
- Returns paginated results

**Total latency: ingestion to searchable = ~minutes** (pipeline runs in sequence). The trigger makes FTS available immediately after load. Semantic search becomes available after the embedding step completes.

---

## Q5: How does the system handle failure at each layer?

**Answer:**

**Pipeline failures:**
- Each run is tracked in `ops.pipeline_runs` with status, row counts, and error details
- Watermarks enable safe retry: re-running a failed script picks up where it left off
- `ops.bulk_import_checkpoints` tracks progress within large imports for resume support
- FK ordering prevents partial state: if legislators fail, bills can't reference them

**API failures:**
- **Graceful degradation:** The politician detail endpoint runs 7+ sub-queries, each in try/except. A failure in funding data doesn't break the profile.
- **ML model unavailability:** If sentence-transformers fails to load, hybrid search drops to 2-signal (FTS + trigram). Vote prediction returns 503 for that endpoint only.
- **Database connection issues:** `pool_pre_ping=True` detects stale connections. asyncpg handles transient connection errors with retry at the pool level.
- **Rate limiting:** SlowAPI returns 429 before requests hit the database, protecting against traffic spikes.
- **Request tracing:** Every request gets a UUID (RequestIDMiddleware) propagated through structlog. Sentry captures exceptions with request context.

**Frontend failures:**
- TanStack Query retries failed requests once (`retry: 1`)
- Loading states show skeleton placeholders, not blank screens
- Error states show retry buttons with back navigation
- Photo loading failures fall back to initial-based avatars (`onError` handler)

**External API failures:**
- JWKS fetch failure: returns `None`, auth endpoints return 401 until next attempt
- Geocodio failure (address lookup): returns empty representatives list
- Anthropic API failure (PAC summaries): returns error message, cached summaries still served

---

## Q6: What are the main trade-offs in the current architecture?

**Answer:**

**1. In-memory caching vs. Redis**
- *Pro:* Zero operational overhead, no Redis to manage, sub-millisecond lookups
- *Con:* Cache lost on restart, not shared across instances, limits horizontal scaling
- *When to change:* When you need more than one API instance

**2. Raw SQL vs. ORM queries**
- *Pro:* Full control over CTEs, window functions, multi-schema joins. Easier to optimize with `EXPLAIN ANALYZE`
- *Con:* No compile-time type safety, manual result mapping, SQL injection risk if not parameterized
- *When to change:* If the team grows and needs ORM guardrails

**3. Single-instance ML serving**
- *Pro:* Simple — models load at startup, no external services
- *Con:* ~500MB memory for sentence-transformers per instance. Cold starts take 10-20s for model loading
- *When to change:* When memory costs or startup time becomes a problem

**4. Pipeline-computed derived tables vs. materialized views**
- *Pro:* Full control over refresh timing, can run complex Python transformations
- *Con:* Data freshness depends on pipeline schedule (daily/weekly). Stale for hours.
- *When to change:* If users need real-time aggregations

**5. Neon Auth vs. self-hosted auth**
- *Pro:* Zero auth infrastructure to manage, EdDSA JWT validation is simple
- *Con:* Vendor lock-in to Neon, limited customization of auth flows
- *When to change:* If auth requirements grow beyond what Better Auth supports

**6. pgvector vs. dedicated vector DB (Pinecone, Qdrant)**
- *Pro:* Vectors live next to relational data — one query joins bills + embeddings. No sync between systems.
- *Con:* pgvector HNSW is slower than purpose-built vector DBs at high scale. Limited vector operations.
- *When to change:* When vector volume exceeds ~1M and query latency matters
