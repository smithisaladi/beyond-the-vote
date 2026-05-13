# Scaling & Performance Questions

Deep-dive questions about performance optimization, scaling strategies, and infrastructure decisions.

---

## Q1: The hybrid search query joins 3 CTEs with FULL OUTER JOIN. How does this perform, and how would you optimize it?

**Answer:**

**Current performance characteristics:**
- Each CTE is capped at `LIMIT 100`, so the fusion operates on at most 300 candidate documents
- The FULL OUTER JOIN on bill_id across 3 small sets is cheap (hash join)
- The expensive parts are the individual CTEs:
  - **FTS:** GIN index on `search_vector` makes `@@` fast (sub-millisecond for most queries)
  - **Trigram:** `similarity()` function scans the `gin_trgm_ops` index on `title`. The `> 0.1` threshold filters early.
  - **Semantic:** HNSW index on `embedding` gives approximate nearest-neighbor in ~5ms for 40K vectors

**Measured bottleneck:** The semantic CTE is slowest because:
1. Query-time embedding takes ~10-50ms (sentence-transformers inference)
2. HNSW traversal adds ~5-10ms
3. The JOIN back to `congress.bills` for filter application can't use the HNSW index directly

**Optimization strategies (in priority order):**

1. **Pre-filter before HNSW** — Currently, filters (`status`, `topics`) are applied after the vector scan. Postgres can't push WHERE clauses into HNSW. Solution: create partitioned HNSW indexes per congress or status, or use a two-phase approach (filter first, then vector search on the filtered set).

2. **Embedding cache** — Cache query embeddings for frequently searched terms. Many users search the same topics ("healthcare", "immigration"). A simple LRU cache eliminates repeated inference.

3. **Async parallelism** — Run the 3 CTEs as separate async queries and merge in Python. Currently they're sequential within a single SQL statement. Parallel execution would reduce wall time from max(FTS + trigram + semantic) to max(FTS, trigram, semantic).

4. **Materialized FTS** — For browse-mode (no query), skip FTS/trigram entirely and serve from a pre-ranked list (e.g., by `last_action_date DESC`).

5. **Dedicated search service** — At very high scale, move to OpenSearch/Elasticsearch which natively supports multi-signal ranking in a single query.

---

## Q2: How do you handle the 4GB FEC individual contribution files?

**Answer:**

This is one of the most important data engineering decisions in the pipeline. Individual contributions from the FEC are ~4GB per election cycle (20M+ rows), and they're pipe-delimited with no headers.

**The rule: never load into memory, never load into Postgres.**

Individual contributions are used only for aggregation (top contributors by employer/org). The pipeline:

1. **Downloads** the FEC bulk ZIP files and extracts pipe-delimited CSVs to `data/processed/fec/`
2. **Adds headers** based on column position definitions in `config.py` (FEC files have no headers)
3. **Queries with DuckDB** — DuckDB reads CSVs directly without loading into memory:
   ```sql
   SELECT cmte_id, SUM(transaction_amt) as total
   FROM read_csv('data/processed/fec/indiv24.csv',
                  delim='|', header=true, ignore_errors=true)
   WHERE cycle = 2024
   GROUP BY cmte_id
   ```
4. **Loads aggregated results** into `derived.*` tables via `upsert()`

**Why DuckDB over pandas?**
- DuckDB streams data from disk — constant memory regardless of file size
- Columnar execution is 10-100x faster for grouped aggregations
- SQL interface is more readable than pandas groupby chains
- Native Parquet support for faster re-reads

**Why not load into Postgres?**
- 20M+ rows per cycle would bloat the database unnecessarily
- Only aggregated results are needed (top employers, PAC totals)
- DuckDB processes 4GB in under a minute; Postgres COPY would take much longer and consume storage

**Error handling:**
- `ignore_errors=true` in DuckDB skips malformed rows (FEC data has encoding issues)
- The pipeline logs skipped row counts for monitoring

---

## Q3: Explain your caching strategy. Why no Redis?

**Answer:**

The API uses `cachetools.TTLCache` (in-memory Python dictionary with TTL expiration):

| Cache | TTL | Reason |
|-------|-----|--------|
| JWKS keys | 1 hour | Rotates rarely, HTTP call to Neon |
| Politician contributors | 24 hours | Complex 5-CTE aggregation, data changes weekly |
| Donor leaderboard | 10 minutes | Frequently accessed, moderate query cost |
| AI summaries | 30 days | Anthropic API cost + latency |

**Why no Redis:**
- Single Render instance — no cache sharing needed
- TTLCache is zero-latency (in-process memory)
- Zero operational overhead (no Redis to provision, monitor, pay for)
- Cache sizes are small (100s of entries, not millions)

**When this breaks down:**
- Multiple API instances: caches diverge, user sees different data per request
- Container restart: cold cache, thundering herd on expensive queries
- Memory pressure: sentence-transformers already uses ~500MB, adding large caches risks OOM

**Migration path to Redis:**
1. Replace `TTLCache` with `redis-py` async client
2. Serialize cache values as JSON (currently native Python dicts)
3. Add Redis connection string to config
4. Cache keys are already well-structured (e.g., `bioguide_id`, `(q, limit, offset)`)

**What I'd do before adding Redis:**
- Add `Cache-Control` headers to API responses for CDN-level caching
- Use Neon's connection pooler (PgBouncer) to reduce connection overhead
- Add materialized views for the heaviest aggregations

---

## Q4: How does the connection pool work with async? What happens during a traffic spike?

**Answer:**

SQLAlchemy's async engine manages a connection pool over asyncpg:

```python
engine = create_async_engine(
    database_url,
    pool_size=5,          # Always-open connections
    max_overflow=10,      # Additional connections under load
    pool_pre_ping=True,   # Verify connection before use
)
```

**Normal operation (< 5 concurrent requests):**
- Requests check out connections from the pool
- After the handler completes, connections return to the pool
- Connections are reused (no TCP handshake/TLS overhead per request)

**Moderate load (5-15 concurrent requests):**
- Pool grows with `max_overflow` connections (temporary, closed after use)
- Up to 15 total connections available

**Spike (> 15 concurrent requests):**
- The 16th request blocks, waiting for a connection (default 30s timeout)
- If timeout is exceeded, raises `TimeoutError` → 503 to client

**Neon-specific considerations:**
- Neon has a connection limit per tier (e.g., 100 for Pro)
- Neon's built-in PgBouncer provides connection pooling on their side
- `pool_pre_ping=True` is essential: Neon may close idle connections after ~5 minutes
- The `sslmode=require` → `ssl=require` URL transformation in `config.py` handles asyncpg SSL compatibility

**What I'd change for higher traffic:**
1. Increase `pool_size` to 10, `max_overflow` to 20
2. Use Neon's pooled connection endpoint (PgBouncer mode)
3. Add connection pool metrics to structlog for monitoring
4. Implement circuit breaker: if pool is exhausted, return 503 immediately instead of blocking

---

## Q5: The politician detail page makes 7+ sub-queries. Why not a single JOIN?

**Answer:**

The politician detail endpoint (`GET /api/politicians/{bioguide_id}`) assembles data from multiple schemas:

1. Legislator profile (`congress.legislators`)
2. Ideology scores (`congress.member_scores`)
3. Committee memberships (`congress.committee_memberships JOIN congress.committees`)
4. Recent votes (`congress.bill_vote_positions JOIN congress.bill_vote_summaries`)
5. Sponsored bills (`congress.bills`)
6. Funding breakdown (`derived.legislator_funding_summary`)
7. Top PACs (`derived.legislator_top_pacs`)
8. Top contributors (`fec.pac_to_candidate` aggregation)

**Why separate queries instead of one big JOIN?**

1. **Cardinality explosion**: JOINing a legislator with 50 votes, 20 bills, 10 PACs, and 5 committees produces 50 * 20 * 10 * 5 = 50,000 rows. Separate queries return 50 + 20 + 10 + 5 = 85 rows total.

2. **Independent failure**: Each query is wrapped in try/except. If the funding data is unavailable (pipeline hasn't run yet), the profile still loads with everything else. A single JOIN would fail entirely.

3. **Different caching profiles**: Contributors are cached 24h (expensive, rarely changes). Recent votes change daily. A single query can't be cached partially.

4. **Readability**: 7 simple queries are easier to understand and optimize than a 100-line multi-JOIN SQL statement.

**Performance impact:** Each query takes 1-5ms on indexed columns. 7 sequential queries = 7-35ms total. Acceptable for a detail page that's loaded once per navigation.

**Optimization opportunity:** Run the 7 queries concurrently with `asyncio.gather()`:
```python
profile, scores, committees, votes, bills, funding, pacs = await asyncio.gather(
    get_profile(db, bioguide_id),
    get_scores(db, bioguide_id),
    get_committees(db, bioguide_id),
    # ...
)
```
This would reduce wall time from 7 * avg to max(avg), roughly a 5-7x improvement.

---

## Q6: How does the pipeline handle idempotency and failure recovery?

**Answer:**

**Idempotent writes via upsert:**
```python
def upsert(conn, table, rows, conflict_columns, update_columns):
    """INSERT ... ON CONFLICT (conflict_columns) DO UPDATE SET ..."""
```

Every write is an upsert. Re-running the same pipeline step produces the same result. No duplicate rows, no constraint violations.

**Watermark-based incremental sync:**
```python
# At start of run
watermark = get_watermark("sync_bills")  # Last successful run's timestamp

# Fetch only new data
bills = fetch_bills_since(watermark)

# At end of run
log_run_end(run_id, rows_processed=len(bills), watermark=now())
```

If a run fails midway:
- The watermark is NOT updated (it's only set on success)
- The next run re-fetches from the same watermark
- Upsert ensures already-processed rows are updated, not duplicated

**Checkpoint-based resume for large imports:**
```sql
-- ops.bulk_import_checkpoints
(script, source_file, chunk_index, status)
```

For multi-gigabyte FEC imports, the pipeline tracks which chunks have been processed. On failure, it resumes from the last incomplete chunk instead of re-processing everything.

**FK ordering prevents inconsistent state:**
The pipeline enforces a strict run order (legislators → scores → bills → votes → FEC). If legislators fail, subsequent steps that reference legislator FKs will fail cleanly rather than creating orphaned records.

---

## Q7: What would you monitor in production? What alerts would you set up?

**Answer:**

**Application metrics (Sentry + structlog):**
- Request latency p50/p95/p99 per endpoint
- Error rate by status code (4xx vs 5xx)
- Slow query log (queries > 500ms)
- ML model inference latency (embedding time per search)

**Database metrics (Neon dashboard):**
- Connection pool utilization (approaching `pool_size + max_overflow`)
- Query count and duration by type
- Index hit rate (should be >99%)
- Table size growth (especially `fec.*` after weekly imports)

**Pipeline metrics (ops.pipeline_runs):**
- Failed runs (status != 'completed')
- Row count trends (sudden drop = data source issue)
- Run duration trends (increasing = data volume growth)
- Error counts per module

**Alerts I'd set up:**
1. **P0:** API error rate > 5% for 5 minutes → page on-call
2. **P0:** Pipeline run fails 2x consecutively → alert in Slack
3. **P1:** Search latency p95 > 2 seconds → investigate
4. **P1:** Database connections > 80% of limit → scale pool
5. **P2:** JWKS fetch failure → auth degraded, check Neon status
6. **P2:** AI summary generation failure rate > 50% → check Anthropic API
7. **P3:** Cache hit rate drops below 60% → review TTL settings
