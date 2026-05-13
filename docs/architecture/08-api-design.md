# API Design

The API is built with FastAPI, organized into domain routers, and uses async database access throughout. It auto-generates an OpenAPI schema consumed by the frontend for type safety.

## Router Map

| Router | Prefix | Auth | Purpose |
|--------|--------|------|---------|
| `bills` | `/api/bills` | Optional | Bill search, detail, votes, by-topic |
| `politicians` | `/api/politicians` | Optional | Politician search, profiles, funding |
| `donors` | `/api/donors` | Optional | PAC leaderboard, detail, AI summaries, money flow |
| `dashboard` | `/api/dashboard` | **Required** | Follow/track, activity feed |
| `representatives` | `/api/representatives` | Optional | Address → district → legislators |
| `money_flow` | `/api/money-flow` | Optional | PAC chain tracing |
| `donor_similarity` | `/api/donors/.../similar` | Optional | pgvector nearest-neighbor |
| `ml` | `/api/legislators` | Optional | Funding comparison, vote prediction |
| `research` | `/api/research` | Optional | Anomaly data (suspicious patterns) |

## Endpoint Reference

### Bills

```
GET  /api/bills?q=&status=&topics=&sort=&limit=&offset=
     → { bills: BillSummary[], total: number }

GET  /api/bills/by-topic?slug=&status=&limit=
     → { slug: string, bills: BillSummary[], count: number }

GET  /api/bills/{bill_id}
     → BillDetail (with votes, cosponsors, actions)
```

### Politicians

```
GET  /api/politicians/search?q=
     → { politicians: PoliticianSummary[] }

GET  /api/politicians/{bioguide_id}
     → PoliticianDetail (with scores, committees, votes, funding, donors)
```

### Donors

```
GET  /api/donors?q=&limit=&offset=
     → { contributors: ContributorEntry[], pagination: PaginationMeta }

GET  /api/donors/{cmte_id}
     → DonorDetail (with top recipients, AI summary)

GET  /api/donors/{cmte_id}/money-flow
     → { topFunders[], topRecipients[], flowStats } (money flow visualization)

POST /api/donors/{cmte_id}/summary
     → { summary: string }  (generates AI summary)
```

### Dashboard (Auth Required)

```
GET    /api/dashboard/followed
       → { politicians: FollowedPolitician[], recentVotes: Vote[] }

POST   /api/dashboard/follow/{politician_id}
DELETE /api/dashboard/follow/{politician_id}

GET    /api/dashboard/tracked-bills
       → { bills: TrackedBill[] }

POST   /api/dashboard/track/{bill_id}
DELETE /api/dashboard/track/{bill_id}
```

### ML Endpoints

```
GET  /api/money-flow/{entity_id}?direction=inbound&depth=3
     → { entityId, entityName, totalFlow, nodes: Node[], edges: Edge[] }

GET  /api/donors/{canonical_donor_id}/similar?limit=10
     → { donorId, sourceCluster, similarDonors: SimilarDonor[] }

GET  /api/legislators/{bioguide_id}/funding-comparison?scope=party
     → { percentiles for total_raised, pac, small_donors }

GET  /api/legislators/{bioguide_id}/vote-prediction?bill_id=
     → { prediction, probability, yeaProbability, nayProbability, modelAccuracy }
```

### Research

```
GET  /api/research/suspicious-contributions?committee_id=&min_score=&limit=&offset=
     → { events: SuspiciousEvent[] }

GET  /api/research/committee-changes?committee_id=
     → { changes: ChangePoint[] }
```

## Middleware Stack

Requests pass through these middleware layers in order:

```
Request
  → RequestIDMiddleware (UUID generation, X-Request-ID header)
  → CORSMiddleware (origin validation)
  → SlowAPIMiddleware (rate limiting: 60 req/min default)
  → Router handler
  → Response
```

### Request ID Middleware

```python
class RequestIDMiddleware:
    async def __call__(self, request, call_next):
        request_id = str(uuid4())
        structlog.contextvars.bind_contextvars(request_id=request_id)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
```

Every request gets a UUID, bound to structlog context for correlation across log lines.

## Database Access Patterns

### Raw SQL over ORM

Most queries use raw SQL with `text()` rather than ORM query building:

```python
result = await session.execute(
    text("SELECT * FROM congress.bills WHERE bill_id = :bill_id"),
    {"bill_id": bill_id}
)
row = result.mappings().first()
```

**Why raw SQL?**
- Complex CTEs, window functions, and multi-schema joins are clearer in SQL
- Performance: raw SQL avoids ORM overhead for read-heavy endpoints
- Multi-schema queries (`congress.bills JOIN enrichment.bill_embeddings`) are awkward in ORM

### ORM for Writes

Dashboard mutations (follow/unfollow, track/untrack) use ORM models:

```python
follow = FollowedPolitician(user_id=user_id, politician_id=politician_id)
session.add(follow)
await session.commit()
```

### Connection Pooling

```python
engine = create_async_engine(
    database_url,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,    # Verify connections before use
)
```

- `pool_size=5`: Baseline connections kept open
- `max_overflow=10`: Up to 15 total connections under load
- `pool_pre_ping=True`: Detects stale connections (Neon may close idle connections)

## Caching Strategy

In-memory TTLCache (no Redis) — viable for single-instance deployment:

| Cache | TTL | Key | Purpose |
|-------|-----|-----|---------|
| JWKS keys | 1 hour | Global | Avoid repeated JWKS HTTP calls |
| Politician contributors | 24 hours | `bioguide_id` | Expensive aggregation query |
| Donor leaderboard | 10 minutes | `(q, limit, offset)` | Frequently accessed list |
| AI summaries | 30 days | `cmte_id` | Anthropic API cost savings |

## Error Handling

```python
# 404 for missing resources
if not row:
    raise HTTPException(status_code=404, detail="Bill not found")

# 400 for bad parameters
if direction not in ("inbound", "outbound"):
    raise HTTPException(status_code=400, detail="direction must be inbound or outbound")

# 401 for auth failures (via dependency injection)
raise HTTPException(status_code=401, detail="Missing authorization")

# 503 for service degradation
if not is_model_loaded():
    raise HTTPException(status_code=503, detail="Model not available")
```

### Graceful Degradation

The politician detail endpoint runs 7+ sub-queries. Each is wrapped in try/except so a failure in one (e.g., funding data) doesn't break the entire response:

```python
# Committees
try:
    committees = await get_committees(db, bioguide_id)
except Exception:
    committees = []

# Funding breakdown
try:
    funding = await get_funding(db, bioguide_id)
except Exception:
    funding = None
```

## Startup Lifecycle

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    log.info("loading_ml_models")
    await load_all_models()           # sentence-transformers + vote prediction
    log.info("startup_complete")
    yield
    # Shutdown (cleanup if needed)
```

The lifespan hook loads all ML models before the API accepts requests. If models fail to load, the API still starts — affected endpoints return 503.

## OpenAPI Schema

FastAPI auto-generates an OpenAPI schema at `/openapi.json`. This is used for:
1. **API documentation** at `/docs` (Swagger UI)
2. **Type generation** via `openapi-typescript` → `src/lib/api/generated/schema.ts`
3. **Frontend client** via `openapi-fetch` for type-safe API calls

```bash
# Generate TypeScript types from OpenAPI schema
pnpm codegen
```
