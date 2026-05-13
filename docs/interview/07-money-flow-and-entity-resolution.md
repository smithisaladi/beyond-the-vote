# Money Flow & Entity Resolution Questions

Deep-dive questions about the campaign finance data pipeline, donor resolution, money flow visualization, and production scaling.

---

## Q1: Walk through how a $288M donation from Elon Musk ends up displayed on the PAC detail page.

**Answer:**

**Pipeline (offline):**

1. FEC bulk download fetches `indiv26.txt` (pipe-delimited, no headers) and converts to `indiv.parquet` via DuckDB.

2. Donor resolution extracts 22M individual contributions from parquet. Musk's 40+ contributions land in blocks like `mus_78701`, `mus_78752` (different ZIPs).

3. Within each block, the fast-path groups by exact `(name, employer)`. All "MUSK, ELON" + "SPACE EXPLORATION TECHNOLOGIES CORP." entries merge instantly — no embedding needed.

4. But Musk also donated with empty employer field from a different ZIP. That creates a second canonical ID in a different block.

5. The cross-block merge pass groups all canonical donors by normalized name "musk, elon". It finds two entries sharing the same state (TX) and merges them — the higher-amount entry absorbs the other. Total: $80M for the 2026 cycle, `cmte_ids: ["C00879510", ...]`.

6. `compute_pac_top_funders` re-reads `indiv.parquet` via DuckDB, groups by `(name_lower, employer_lower, cmte_id)`, matches against the canonical donor index, and computes per-PAC amounts. Musk → America PAC = $80M for 2026.

**API (online):**

7. `GET /api/donors/C00879510/money-flow` queries `derived.pac_top_funders` for top funders. Returns Musk as #1.

8. Recipients come from a live query combining `fec.pac_to_candidate` + `fec.independent_expenditures`, with name resolution through `congress.legislators` → `fec.candidates`.

**Frontend:**

9. `MoneyFlowSection` renders the three-column flow. Musk's card appears left with "$80M" and "Space Exploration Technologies · TX". SVG bezier curve connects to the center PAC node with maximum stroke width (highest amount).

**Total path:** Raw FEC bulk file → DuckDB parquet → blocking → clustering → cross-block merge → condensed DB row → per-PAC aggregation → derived table → API query → React component → SVG rendering.

---

## Q2: Why a condensed donor schema instead of one row per contribution?

**Answer:**

The original schema stored one row per contribution mapping:
```sql
(canonical_id, contribution_id, raw_name, raw_employer, raw_address, confidence)
```

For the 2026 cycle alone: 24M contributions → 24M rows → ~4.8GB. Both cycles would be ~10GB. On Neon's free tier, this is unsustainable.

The condensed schema stores one row per canonical donor:
```sql
(canonical_id PK, display_name, employer, state, total_amount, contribution_count, cmte_ids[], confidence)
```

2026 cycle: 1.29M rows → 370MB. A 95% reduction.

**What we lose:** Individual contribution traceability. You can't ask "which specific $2,700 donations belong to this canonical donor?" The `sub_id` mapping is discarded after aggregation.

**Why that's acceptable:** The two consumers of this data are:
1. `pac_top_funders` — only needs aggregated amounts per canonical donor per PAC
2. Donor clustering — only needs behavioral features (total amount, count, PAC spread)

Neither needs contribution-level detail. If we ever need it (e.g., timeline of a donor's giving), we can re-derive it from parquet + canonical ID matching.

**The $200 threshold:** FEC only requires itemized reporting for contributions >$200. Below that, the data is incomplete and noisy. Filtering at $200 cuts 522K donors (29%) that would add bulk without analytical value.

---

## Q3: The cross-block merge uses name + state matching. Isn't that too aggressive? Won't it merge different people named "John Smith" in Texas?

**Answer:**

It's a real risk. The merge criteria are:
1. Exact normalized name match (after lowercasing and suffix stripping)
2. Same employer (substring match) **OR** same state

For "SMITH, JOHN" in TX — there could be hundreds of canonical donors with that name and state. The merge would collapse them all into one entry, inflating one donor's total while erasing others.

**Why it works in practice (mostly):** The blocking step already grouped by `(name_prefix + ZIP)`. Two "John Smith" entries in different blocks means they're in **different ZIPs**. If they're also in different states, they won't merge. If they're in the same state but different ZIPs, they will merge — which is correct more often than not (same person, moved within state or has multiple addresses).

**Where it fails:** Common names in large states. "GARCIA, MARIA" in California could merge several distinct donors. The confidence field drops to 0.75 for cross-block merges, which downstream consumers can use to filter uncertain matches.

**Better approaches we could add:**
- Require employer match (not just state) for common names
- Use a name frequency table — rare names merge on state, common names require employer
- Levenshtein distance on employer instead of substring matching
- Manual override table (`ops.donor_overrides`) for known errors

The current approach is a deliberate trade-off: better deduplication for mega-donors (who have distinctive names) at the cost of some over-merging for common names. Since the primary use case is "top funders per PAC" where amounts are >$10K, the common-name problem rarely affects the visible results.

---

## Q4: How does the fast-path optimization achieve a 9x speedup?

**Answer:**

The block size distribution for the 2026 cycle:
```
1 donor:     269K blocks (21%)  — skip embedding, instant
2-5 donors:  450K blocks (35%)  — mostly same person donating multiple times
6-20 donors: 383K blocks (30%)  — mix of same + different donors
21-100:      131K blocks (10%)  — need embedding
100+:         28K blocks (2%)   — heavy embedding, but rare
```

**Before optimization:** Every block with >1 donor called `embed_texts()`, even if all entries were identical. A block with 5 donations from "SMITH, JOHN" / "ACME CORP" would embed 5 identical strings, run Agglomerative Clustering, and produce 1 cluster. Cost: 5 embedding calls + clustering overhead.

**After optimization:** Three fast paths:

1. **All same text** (covers ~60% of multi-donor blocks): Group by `(name + employer).lower()`. If there's only one group → single cluster. Zero embedding calls.

2. **Deduplicate before embedding** (covers remaining blocks): If 100 donors have 5 unique name+employer combos, embed 5 texts instead of 100. The cluster labels are mapped back to all 100 donors.

3. **Tiny all-unique blocks ≤3** (covers ~5% of blocks): 3 different people in the same ZIP prefix. Almost certainly distinct — skip embedding, each gets their own cluster.

**Net effect:** Embedding calls dropped from ~1.2M (one per multi-donor block) to ~160K (only blocks needing actual clustering). Runtime: ~100 min vs 6+ hours.

---

## Q5: The PAC leaderboard now includes all candidates, not just current legislators. What changed and why?

**Answer:**

**Before:** Both `pac_leaderboard()` and `pac_detail()` contained:
```sql
WITH congress_cand_ids AS (
    SELECT unnest(fec_ids) AS cand_id FROM congress.legislators
)
...WHERE cand_id IN (SELECT cand_id FROM congress_cand_ids)
```

This filtered to only money going to current legislators (~540 people). A Super PAC spending $100M on a presidential candidate or a challenger who lost would show $0 in contributions.

**The problem became visible** when investigating Bernie Moreno's top contributors. Defend American Jobs spent $40M in independent expenditures supporting him, but the old `_get_top_contributors` query only counted direct PAC contributions — no IE spending at all. And the PAC leaderboard only counted spending on current legislators.

**What changed:**

1. **`pac_leaderboard`** — removed `congress_cand_ids` CTE entirely. Now counts all spending.

2. **`pac_detail`** — same filter removal. Added `LEFT JOIN fec.candidates` for name resolution of non-legislators. Added `WHERE total > 0` to filter $0 entries from refund cancellations.

3. **`_get_top_contributors`** (politician detail) — expanded from direct-only to direct + IE support. Uses `UNION ALL` of `pac_to_candidate` and `independent_expenditures` (where `sup_opp = 'S'`).

4. **Candidate name resolution** — downloaded and loaded FEC `cn.txt` candidate master files (17.7K candidates across both cycles) into `fec.candidates`. This resolved 61% → 2% of unresolvable money flow destinations.

**Impact:** The PAC leaderboard totals increased significantly. Super PACs like FF PAC ($510M), MAGA Inc ($377M), and America PAC ($173M) now show their full spending, not just the portion going to sitting legislators.

---

## Q6: How would you scale the donor resolution pipeline to handle all FEC cycles (2000-2026)?

**Answer:**

**Current state:** 2026 cycle only. 22M contributions → 100 min processing → 1.29M canonical donors.

**Full historical data:** ~13 cycles × 20-80M contributions each = 400M+ total contributions. At current rate, that's ~30 hours of processing.

**Scaling strategy:**

1. **Parallelize by cycle** — Each cycle is independent during the blocking/clustering phase. Run 4-6 cycles concurrently on separate processes. The cross-block merge runs once at the end across all cycles' canonical donors.

2. **Pre-filter in DuckDB** — Before extracting to Python, use DuckDB to aggregate identical `(name, employer, zip, cmte_id)` groups. This reduces 80M contributions to ~5M unique groups per cycle. The clustering step then operates on groups, not individual contributions.

3. **Persistent blocking index** — Instead of rebuilding blocks from scratch each run, maintain a mapping of `(name_prefix, zip5) → block_id` that persists across cycles. New contributions slot into existing blocks.

4. **Incremental resolution** — For weekly updates, only process new contributions (via watermark). Match them against existing canonical donors by name+employer key. Only create new canonical IDs for genuinely new donors.

5. **Larger compute** — Move from GitHub Actions to a dedicated compute instance (or Render background worker) with 16GB+ RAM for the full historical corpus.

**Storage scaling:**

| Cycles | Est. Canonical Donors | Est. DB Size |
|--------|----------------------|-------------|
| 1 (current) | 1.3M | 370MB |
| 2 | 2.5M | 700MB |
| 13 (all) | ~15M | ~4GB |

At 15M rows, the condensed schema is still manageable. The per-contribution schema would be ~200M rows / ~50GB — not viable.

---

## Q7: What are the biggest production risks in the current system?

**Answer:**

**1. Neon connection idle timeout (MITIGATED)**

The pipeline processes 22M contributions in-memory for ~30 min before writing to DB. Neon closes idle connections after ~5 min. Fixed by calling `reset_conn()` before long processing and using a liveness check (`SELECT 1`) in `get_conn()` before each use.

**2. Cross-block merge false positives (KNOWN)**

Common names in the same state will over-merge. "GARCIA, MARIA" in CA could collapse 50 distinct donors. Mitigated by confidence scoring (0.75 for cross-block merges) but not fully solved. A name frequency table or employer-required matching for common names would help.

**3. Pre-computed vs live data staleness**

Top funders come from `derived.pac_top_funders` (weekly pipeline), while recipients come from live FEC table queries. If a major donation happens after the last pipeline run, it won't appear in the funders column until the next run. The weekly refresh cadence matches FEC bulk file updates, so this is acceptable.

**4. Memory usage during resolution**

The pipeline loads 22M contribution dicts into memory (~3-4GB), plus the embedding model (~500MB). On a 8GB machine this leaves little headroom. For the 2024 cycle (58M contributions), this would OOM. Solution: process in cycle-sized batches (already the case) and consider streaming the extraction.

**5. Single-instance caching**

The API uses in-memory `TTLCache` for leaderboard (10min), contributors (24h), and AI summaries (30d). On Render with a single instance, this works. With multiple instances, caches diverge. Migration to Redis would be needed for horizontal scaling.

**6. AI summary generation has no timeout**

The Anthropic API call in `POST /api/donors/{cmte_id}/summary` has no explicit timeout. A network issue could hang the request indefinitely. Should add a 30s timeout.

**7. Money flow attribution covers top 500 only**

The pipeline traces money flows for the 500 highest-inbound committees. Smaller PACs in long chains are not captured. This means the flow visualization may show incomplete data for niche PACs.

---

## Q8: Why SVG bezier curves for the flow visualization instead of a library like D3 or react-flow?

**Answer:**

**The requirements are simple:** 5-10 curves connecting card elements to a center node. The curves are static (computed once on mount, recomputed on resize). No interaction (hover, drag, zoom). No animation.

**D3 would be overkill:**
- Adds ~230KB to the bundle (the entire app is 1.4MB)
- Requires imperative DOM manipulation that fights React's declarative model
- The actual SVG path is one line: `M x1,y1 C mx,y1 mx,y2 x2,y2`

**react-flow is for interactive node graphs:**
- Drag-and-drop, zoom, pan, edge routing
- None of which we need — this is a static editorial visualization
- Would add significant bundle size and complexity

**The current implementation:**
```tsx
function FlowCurve({ x1, y1, x2, y2, weight }: CurveData) {
  const midX = (x1 + x2) / 2;
  return (
    <path
      d={`M ${x1},${y1} C ${midX},${y1} ${midX},${y2} ${x2},${y2}`}
      stroke="#7B5E8A"
      strokeWidth={1 + weight * 2}
      opacity={0.15 + weight * 0.45}
    />
  );
}
```

~15 lines of code. No dependencies. The curve positions are computed via `useLayoutEffect` + `getBoundingClientRect()` on the card refs, which gives pixel-accurate placement that responds to layout changes.

**Trade-off:** If we later need interactive graph exploration (hover to highlight paths, click to drill down), we'd outgrow this approach and reach for a graph library. But the design decision was explicitly editorial over exploratory — surface the insights, don't make users pan around a graph.

---

## Q9: How do you handle the case where a PAC spends money both supporting and opposing the same candidate?

**Answer:**

This actually happens. A PAC might run ads supporting a candidate in the primary, then opposition ads in the general (or vice versa if the candidate shifts positions).

The API returns `direct`, `ieFor`, and `ieAgainst` as separate fields per recipient:

```json
{
  "name": "Jane Doe",
  "direct": 5000,
  "ieFor": 100000,
  "ieAgainst": 50000,
  "amount": 155000
}
```

The frontend determines the dominant spending type:
```typescript
const isOppose = (r.ieAgainst ?? 0) > (r.ieFor ?? 0) && (r.ieAgainst ?? 0) > (r.direct ?? 0);
```

If IE against is the largest component, the card gets:
- A red border (`border-[#B85C38]/25`)
- An "Oppose" badge in red
- The spending breakdown shows all three: `"Direct $5K · IE for $100K · IE against $50K"`

The `amount` field is the sum of all three (used for ranking), but the breakdown makes it clear that $50K of that was opposition spending.

**Edge case:** If `ieFor` and `ieAgainst` are exactly equal, `isOppose` is false — the card shows without the oppose badge. This is a reasonable default since the spending is balanced.

---

## Q10: What would a production deployment look like for the full pipeline + API?

**Answer:**

**Current state (development):**
- Pipeline: local machine + GitHub Actions
- API: Render starter (~$7/mo)
- Database: Neon free/pro tier
- Frontend: Vercel free tier

**Production deployment:**

| Component | Service | Spec | Cost |
|-----------|---------|------|------|
| Pipeline (daily) | GitHub Actions | 4 CPU, 16GB RAM, 30 min | Free tier |
| Pipeline (enrichment) | Render Background Worker | 2GB RAM, runs weekly | ~$15/mo |
| API | Render Web Service | 1GB RAM, 2 instances | ~$14/mo |
| Database | Neon Pro | 10GB storage, read replicas | ~$19/mo |
| Cache | Upstash Redis | For multi-instance caching | ~$10/mo |
| Frontend | Vercel | Static SPA, CDN | Free |
| Monitoring | Sentry + structlog | Error tracking + request tracing | Free tier |

**Key production changes:**

1. **Redis for caching** — Replace `TTLCache` with Redis. Required for multiple API instances. Cache keys are already well-structured.

2. **Read replica** — Route read-heavy PAC queries to a Neon read replica. The leaderboard query is the heaviest (full table scan with aggregation).

3. **Background worker for enrichment** — Donor resolution + money flow + top funders computation runs as a Render background job, not on the API server. Triggered weekly by GitHub Actions.

4. **CDN caching** — Add `Cache-Control: public, max-age=600` to public endpoints (leaderboard, PAC detail). Reduces API load for popular PACs.

5. **Connection pooling** — Use Neon's PgBouncer endpoint for the API. The pipeline uses direct connections (long-running queries don't work well with PgBouncer's transaction mode).

6. **Monitoring** — Alert on: pipeline failures (2x consecutive), API p95 > 2s, DB connections > 80%, money flow computation errors.
