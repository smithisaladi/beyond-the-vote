# Frontend & API Questions

Technical deep-dive on the React SPA, TanStack ecosystem, API design, and full-stack patterns.

---

## Q1: Why TanStack Router over React Router? What's the mental model?

**Answer:**

TanStack Router was chosen for three key properties that React Router v6 lacks:

**1. Type-safe route params:**
```typescript
// TanStack Router — params are typed
const Route = createFileRoute("/representatives/$id")({
  component: RepDetailPage,
});
// In the component: useParams() returns { id: string } — TypeScript knows the shape

// React Router — params are always string | undefined
const { id } = useParams();  // id: string | undefined
```

**2. File-based route generation:**
Routes are derived from the filesystem. No manual route configuration. The `@tanstack/router-plugin` Vite plugin watches `src/routes/` and generates `routeTree.gen.ts`. Adding a page = adding a file.

**3. `beforeLoad` for auth guards:**
```typescript
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session) throw redirect({ to: "/" });
  },
});
```

The `beforeLoad` hook runs before the component renders, preventing flash of authenticated content. React Router's `loader` pattern is similar but less ergonomic for auth checks.

**The RSC mental model (without RSC):**
TanStack Router borrows ideas from React Server Components — route-level data loading, type-safe navigation, layout nesting — but runs entirely client-side. The `_authenticated` layout wrapper is conceptually similar to a server component layout that validates auth before rendering children. The key difference: everything runs in the browser, not on a server.

**Layout routes (`_authenticated`):**
The underscore prefix creates a layout route — it wraps child routes without adding a URL segment:
```
/_authenticated/home    → URL is /home, wrapped in auth layout
/_authenticated/bills   → URL is /bills, wrapped in auth layout
```

This mirrors Next.js's layout convention but in a pure SPA.

---

## Q2: How does TanStack Query manage cache invalidation? What's the stale-while-revalidate strategy?

**Answer:**

TanStack Query uses a `staleTime` / `gcTime` model:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,    // Data is "fresh" for 2 minutes
      gcTime: 5 * 60 * 1000,       // Cached data kept for 5 minutes after last use
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

**Lifecycle of a query:**

1. **First fetch:** Query runs, data is cached with key `["bills", params]`. Status: fresh.
2. **Within 2 minutes:** Subsequent `useBills(params)` calls return cached data instantly. No network request.
3. **After 2 minutes:** Data is "stale". The cached data is still returned immediately, but a background refetch is triggered. When new data arrives, the UI updates.
4. **After 5 minutes of no usage:** Cached data is garbage collected. Next access triggers a fresh fetch with loading state.

**Explicit invalidation after mutations:**
```typescript
export function useFollowPolitician() {
  return useMutation({
    mutationFn: async ({ politicianId, follow }) => { ... },
    onSuccess: () => {
      // Invalidate related queries — forces refetch
      queryClient.invalidateQueries({ queryKey: ["dashboard", "followed"] });
    },
  });
}
```

When a user follows a politician, the dashboard data is invalidated immediately. The next render of the dashboard component triggers a fresh fetch.

**Why `refetchOnWindowFocus: false`?**
Political data doesn't change in real-time. Refetching every time a user switches tabs wastes bandwidth and creates visual flicker. The 2-minute stale time is sufficient for freshness.

**Query key design:**
```typescript
queryKey: ["bills", { q, status, topics, sort, limit, offset }]
```

Each unique parameter combination gets its own cache entry. Changing a filter parameter triggers a new fetch (cache miss), while going back to a previous filter state serves from cache (cache hit).

---

## Q3: How does the frontend handle optimistic updates vs. server reconciliation?

**Answer:**

The app currently uses **server reconciliation** (not optimistic updates) for mutations:

```typescript
const followMutation = useFollowPolitician();

// On button click
followMutation.mutate({ politicianId: id, follow: true });

// The mutation:
// 1. Sends POST to server
// 2. Waits for response
// 3. On success: invalidates dashboard queries
// 4. On error: shows error state
```

**Why not optimistic updates?**

For follow/unfollow and track/untrack, the round-trip is fast enough (< 200ms) that users don't notice the delay. Optimistic updates add complexity:
- Need to handle rollback if the server rejects
- Need to handle race conditions (user clicks follow, then unfollow before first request completes)
- The visual feedback (button state change) happens almost instantly anyway because the mutation's `isPending` state disables the button

**Where optimistic updates would help:**
If the app added features like note-taking or bulk operations where the perceived latency matters more, optimistic updates with rollback would be worth the complexity.

**Set-based tracking pattern:**
```typescript
const trackedBillIds = new Set((trackedData?.bills ?? []).map(b => b.id));
const isTracked = trackedBillIds.has(billId);
```

The tracked/followed state is derived from the cached query data (a Set for O(1) lookups). This means any query invalidation automatically updates all components showing tracked state.

---

## Q4: Walk through the full lifecycle of a search request — from keystroke to rendered results.

**Answer:**

**1. Keystroke → Debounced query**
```typescript
const [query, setQuery] = useState("");
const debouncedQuery = useDebounce(query, 300);
```
User types "healthcare costs". Each keystroke updates `query`, but `debouncedQuery` only updates 300ms after the last keystroke. This prevents firing a request per character.

**2. Query hook fires**
```typescript
const { data, isLoading, isFetching } = useBills({
  q: debouncedQuery,
  status: [...selectedStatuses],
  topics: [...selectedTopics],
  sort: sortBy,
  limit: 20,
  offset: 0,
});
```
TanStack Query checks the cache for `["bills", { q: "healthcare costs", ... }]`. Cache miss → fires `queryFn`.

**3. API request**
```typescript
const resp = await apiFetch(`/api/bills?q=healthcare+costs&limit=20&offset=0`);
```
`apiFetch()` injects the JWT Bearer token and sends to `/api/bills`.

**4. FastAPI handler**
```python
@router.get("/api/bills")
async def list_bills(q: str = None, ...):
    if q:
        # Embed the query for semantic search
        query_embedding = get_embedding(q) if is_model_loaded() else None
        # Run hybrid search
        bills, total = await hybrid_bill_search(session, q, query_embedding, ...)
```

**5. Hybrid search executes**
- CTE 1 (FTS): `websearch_to_tsquery('english', 'healthcare costs')` matches against `search_vector`. Returns top 100 by `ts_rank_cd`.
- CTE 2 (Trigram): `similarity(title, 'healthcare costs')` returns top 100 with score > 0.1.
- CTE 3 (Semantic): `embedding <=> query_embedding` returns top 100 by cosine distance.
- Fusion: FULL OUTER JOIN + RRF scoring → ORDER BY rrf_score DESC → LIMIT 20.

**6. Response serialized**
FastAPI serializes results via Pydantic schema. Returns JSON with `bills[]` and `total`.

**7. TanStack Query caches**
Response cached under `["bills", { q: "healthcare costs", ... }]`. Fresh for 2 minutes.

**8. React renders**
```typescript
if (isLoading) return <BillsSkeleton />;
return <BillList bills={data.bills} />;
```
Skeleton replaced with bill cards. Subsequent navigation back to this search serves from cache instantly.

**Total time:** ~150-400ms depending on query complexity and whether semantic search is available.

---

## Q5: How would you add real-time features (e.g., live vote tracking)?

**Answer:**

Currently, all data is fetched via polling (manual refresh or stale-time-based refetch). For live vote tracking during a House/Senate session:

**Option 1: Server-Sent Events (SSE) — Recommended**
```python
# API: FastAPI SSE endpoint
@router.get("/api/votes/live")
async def live_votes():
    async def event_generator():
        while True:
            new_votes = await check_for_new_votes()
            if new_votes:
                yield f"data: {json.dumps(new_votes)}\n\n"
            await asyncio.sleep(30)
    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

```typescript
// Frontend: EventSource
const eventSource = new EventSource("/api/votes/live");
eventSource.onmessage = (event) => {
  const votes = JSON.parse(event.data);
  queryClient.setQueryData(["votes", "live"], votes);
};
```

**Why SSE over WebSockets:** Unidirectional (server→client) is sufficient for vote updates. SSE auto-reconnects, works through proxies, and uses standard HTTP (no upgrade handshake). The frontend only needs to receive updates, not send them.

**Option 2: Aggressive polling with TanStack Query**
```typescript
useQuery({
  queryKey: ["votes", "live"],
  queryFn: fetchLiveVotes,
  refetchInterval: 10_000,  // Poll every 10 seconds during live sessions
  enabled: isSessionActive,  // Only poll during active sessions
});
```

Simpler but less responsive. 10-second polling is acceptable for vote tracking (votes happen over minutes, not seconds).

**Option 3: WebSockets (if bidirectional needed)**
If users could interact during live sessions (e.g., predict their legislator's vote in real-time), WebSockets would enable bidirectional communication. But the current use case is read-only.

**Data source challenge:** Congress.gov doesn't provide real-time vote feeds. The pipeline would need to poll the Congress.gov API at higher frequency during session hours, or use a third-party provider like ProPublica's Congress API which has faster updates.

---

## Q6: How does the design system prevent UI inconsistencies?

**Answer:**

The design system is enforced through centralized constants, not documentation:

**Single source of truth (`lib/ui.ts`):**
```typescript
export const PARTY_STYLES = {
  Democrat: { bg: "bg-[#5E85A8]/10", text: "text-[#5E85A8]", ... },
  Republican: { bg: "bg-[#A87B7B]/10", text: "text-[#A87B7B]", ... },
  Independent: { bg: "bg-[#8A8A7A]/10", text: "text-[#8A8A7A]", ... },
};

export const STATUS_STYLES = {
  Active: { bg: "bg-[#7B5E8A]/10", text: "text-[#7B5E8A]" },
  Passed: { bg: "bg-[#68B085]/10", text: "text-[#68B085]" },
  Failed: { bg: "bg-[#B85C38]/10", text: "text-[#B85C38]" },
  // ...
};
```

**Enforcement mechanisms:**
1. **CLAUDE.md rules** explicitly forbid hardcoded colors: "Never hardcode party/status colors — always use `PARTY_STYLES`/`STATUS_STYLES`"
2. **Shared primitives:** `Card`, `Skeleton` components encapsulate the design tokens. Developers use `<Card padding="lg">` rather than recreating card styles.
3. **Opacity-based text hierarchy:** All text uses `text-[#1C1C1A]` with opacity modifiers instead of gray scale classes. This creates a warm, cohesive look from a single base color.
4. **Typography convention:** Serif for headings (via CSS variable), sans for body, mono for bill numbers only. Applied via `style={{ fontFamily: 'var(--font-serif)' }}` — not a Tailwind class.

**What the design system prevents:**
- Random grays (`text-gray-500`) that clash with the warm palette
- Inconsistent party colors across pages
- Bold body text (`font-bold` is banned — only `font-semibold`/`font-medium` for headings)
- Heavy shadows (`shadow-lg` banned — only `shadow-sm` and card-specific shadows)

---

## Q7: How does the API handle the N+1 query problem?

**Answer:**

The API mostly avoids N+1 by design:

**1. Aggregation in SQL, not application code:**
```sql
-- Vote positions aggregated in a single query
SELECT vs.*,
       json_agg(json_build_object(
           'bioguide_id', vp.bioguide_id,
           'position', vp.position,
           'name', l.full_name,
           'party', l.party
       )) AS member_positions
FROM congress.bill_vote_summaries vs
LEFT JOIN congress.bill_vote_positions vp ON vp.vote_id = vs.id
LEFT JOIN congress.legislators l ON l.bioguide_id = vp.bioguide_id
WHERE vs.bill_id = :bill_id
GROUP BY vs.id
```

This returns all vote positions nested inside each vote summary in a single query, rather than fetching positions per vote.

**2. Pre-computed aggregations:**
The `derived.*` tables contain pre-computed results:
- `derived.legislator_funding_summary` → one row per legislator per cycle
- `derived.legislator_top_pacs` → top 10 PACs per legislator
- `derived.contributor_leaderboard_cache` → cached leaderboard with nested `top_recipients` JSONB

These eliminate runtime N+1 patterns where the API would otherwise loop over legislators to compute funding.

**3. Raw SQL for complex joins:**
By using raw SQL instead of ORM lazy-loading, the team explicitly controls which JOINs happen. There's no risk of ORM-generated N+1 from accessing a relationship property in a loop.

**4. Batch endpoints over per-item:**
The dashboard follows endpoint returns all followed politicians with their recent votes in a single query, rather than N requests for N followed politicians.

**Where N+1 could creep in:**
If someone adds ORM relationships with lazy loading (SQLAlchemy's default), iterating over results could trigger N+1. The `expire_on_commit=False` setting in the session factory helps, but the safest approach is to use `selectinload()` or `joinedload()` explicitly when ORM queries are needed.
