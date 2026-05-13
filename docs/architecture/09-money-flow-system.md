# Money Flow System

The money flow system traces how campaign money moves from individual donors through PAC networks to candidates. It spans the full stack: pipeline enrichment, pre-computed derived tables, API aggregation, and a frontend visualization component.

## Data Flow

```
Individual Donors (indiv.parquet, 22M+ rows per cycle)
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  Tier 1: Donor Entity Resolution                              │
│                                                               │
│  blocking (name_prefix + zip5) → embedding clustering →       │
│  fast-path optimization → cross-block merge →                 │
│  condensed output (1 row per canonical donor, >$200 only)     │
│                                                               │
│  → enrichment.donor_canonical (1.3M rows, ~370MB)             │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  compute_pac_top_funders                                      │
│                                                               │
│  Joins indiv.parquet (DuckDB) with canonical donors (DB)      │
│  Groups by (canonical_id, cmte_id) for per-PAC amounts        │
│  Ranks top 10 per PAC                                         │
│                                                               │
│  → derived.pac_top_funders (61K rows)                         │
└───────────────────────────────────────────────────────────────┘

PAC Transfers (pas2.parquet, 700K+ rows per cycle)
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  Tier 2: Money Flow Attribution                               │
│                                                               │
│  NetworkX graph (PAC→candidate + PAC→PAC transfers)           │
│  BFS traversal with proportional attribution (up to 3 hops)   │
│  Top 500 committees by inbound volume                         │
│                                                               │
│  → analytics.money_flow_attribution (1.07M rows)              │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  API: GET /api/donors/{cmte_id}/money-flow                    │
│                                                               │
│  Top funders: derived.pac_top_funders                         │
│  Top recipients: live query on fec.pac_to_candidate +         │
│    fec.independent_expenditures (with sup_opp distinction)    │
│  Flow stats: analytics.money_flow_attribution                 │
│  Fallback: PAC sources when no individual donor data          │
│                                                               │
│  Name resolution: congress.legislators → fec.candidates       │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  Frontend: MoneyFlowSection component                         │
│                                                               │
│  Three-column horizontal flow (desktop):                      │
│    Top Funders → [PAC node] → Top Recipients                  │
│  SVG bezier curves with weight-proportional stroke            │
│  "Oppose" badge for IE-against spending                       │
│  Candidate role labels (Senate / House candidate / Pres.)     │
│  Mobile: vertical stack, no SVG                               │
└───────────────────────────────────────────────────────────────┘
```

## Donor Entity Resolution

### Why It's Hard

FEC individual contribution records have no unique donor ID. The same person appears under name variations, different employers, and multiple addresses:

```
"MUSK, ELON"         / "SPACE EXPLORATION TECHNOLOGIES CORP." / TX 78701
"MUSK, ELON"         / ""                                      / TX 78752
"MUSK, ELON R"       / "SPACEX"                                / CA 90250
```

### The Algorithm (Three-Pass)

**Pass 1: Blocking** — Groups contributions by `(last_name[:3].lower(), zip5)`. This creates ~1.26M blocks from 22M contributions. Donors in the same block share a last name prefix and ZIP code.

**Pass 2: Within-Block Clustering** — For each block:
- **Fast path (80%+ of blocks):** If all donors have identical `name + employer`, they're one person. No embedding needed.
- **Small unique blocks (≤3 unique donors):** Skip embedding — 3 different people in the same ZIP are almost certainly distinct.
- **Remaining blocks:** Embed unique `(name, employer, city, state)` text signatures with `all-MiniLM-L6-v2`, then Agglomerative Clustering with cosine distance threshold 0.15.

**Pass 3: Cross-Block Merge** — Post-resolution pass that merges canonical donors split across blocks (different ZIPs or employer variations). Groups by normalized name (lowercased, suffixes stripped), merges if they share employer (substring match) or state. The highest-amount entry absorbs the others.

### Performance

| Metric | Value |
|--------|-------|
| Input | 22M individual contributions (2026 cycle) |
| Blocks | 1.26M |
| Canonical donors (pre-filter) | 1.81M |
| Canonical donors (>$200, post-merge) | 1.29M |
| DB storage | ~370MB |
| Runtime | ~100 min (with fast-path optimization) |
| Runtime without optimization | ~6+ hours |

The fast-path optimization avoids 90%+ of embedding calls by recognizing that most blocks contain repeat donations from the same person with the same name and employer.

### Condensed Schema

One row per canonical donor (not per contribution):

```sql
CREATE TABLE enrichment.donor_canonical (
    canonical_id    text PRIMARY KEY,       -- "d_{sub_id}" of anchor contribution
    display_name    text NOT NULL,          -- Best name variant (longest)
    employer        text,
    city            text,
    state           text,
    zip5            text,
    total_amount    numeric(12,2) NOT NULL, -- Sum across all contributions
    contribution_count integer NOT NULL,
    cmte_ids        text[] NOT NULL,        -- PACs donated to
    confidence      real NOT NULL,          -- 1.0 (single), 0.85 (clustered), 0.75 (cross-block)
    model_version   text NOT NULL
);
```

**Why condensed?** The previous per-contribution schema would store 24M rows (~4.8GB) for the 2026 cycle alone. The condensed schema stores 1.29M rows (~370MB) — a 95% reduction. The trade-off: individual contribution-level traceability is lost, but the use case (top funders per PAC, clustering) only needs donor-level aggregates.

## Per-PAC Donor Amounts

The `compute_pac_top_funders` script bridges canonical donors with raw contribution data:

1. Loads canonical donor metadata from Postgres (name, employer, confidence)
2. Queries raw contributions from `indiv.parquet` via DuckDB, grouped by `(name_lower, employer_lower, zip5, cmte_id)`
3. Matches against canonical donors using `(name_lower, employer_lower)` key
4. Aggregates per `(canonical_id, cmte_id)` → per-PAC amount
5. Ranks top 10 per PAC, stores in `derived.pac_top_funders`

This avoids the inflation bug where `unnest(cmte_ids)` would assign a donor's total across all PACs to each individual PAC.

## Money Flow Graph

### PAC Transfer Extraction

The `money_flow` module reads `pas2.parquet` and extracts two types of transfers:

```sql
-- PAC to candidate (direct + IE)
SELECT cmte_id as source, cand_id as dest, SUM(transaction_amt) as amount
WHERE cand_id IS NOT NULL AND transaction_tp IN ('24K', '24Z', '24A', '24E')

-- PAC to PAC (direct only)
SELECT cmte_id as source, other_id as dest, SUM(transaction_amt) as amount
WHERE other_id LIKE 'C%' AND transaction_tp IN ('24K', '24Z')
```

### Proportional Attribution

For multi-hop paths (A → B → C → Candidate), the attribution algorithm computes:

```
attribution = direct_weight × Π(edge_weight / total_outflow at each node)
```

If PAC-A sends $100 to PAC-B (out of $200 total outflow), and PAC-B sends $50 to a candidate, the attributed amount from PAC-A to that candidate is: $50 × ($100 / $200) = $25.

### Scale

| Metric | 2024 Cycle | 2026 Cycle |
|--------|-----------|-----------|
| PAC transfers extracted | 285K | 176K |
| Graph nodes | 8,669 | 6,607 |
| Committees traced | 500 (top by inbound) | 500 |
| Money flow rows | 703K | 371K |
| Total attributed | $5.06B | $624M |

## API Endpoint

`GET /api/donors/{cmte_id}/money-flow` aggregates from three sources:

- **Top funders:** `derived.pac_top_funders` (pre-computed). Fallback: top PAC sources from `money_flow_attribution` when no individual donor data exists.
- **Top recipients:** Live query combining `fec.pac_to_candidate` (direct) and `fec.independent_expenditures` (IE with support/oppose distinction). Joined with `congress.legislators` and `fec.candidates` for name resolution.
- **Flow stats:** Aggregates from `money_flow_attribution` (total inbound/outbound, funder/recipient counts).

### IE Support vs Oppose

The API returns `direct`, `ieFor`, and `ieAgainst` separately for each recipient. A PAC spending $40M *against* a candidate (independent expenditures to oppose) is fundamentally different from spending $40M *for* them.

```json
{
  "name": "Sherrod Brown",
  "party": "Democrat",
  "amount": 40134927,
  "direct": 0,
  "ieFor": 0,
  "ieAgainst": 40134927,
  "candOffice": "S"
}
```

### Candidate Resolution

Recipients are resolved through a chain of fallbacks:
1. `congress.legislators` — current members (via `fec_ids` array match)
2. `fec.candidates` — all federal candidates (House/Senate/Presidential)
3. Raw candidate ID as last resort

The `candOffice` field (`H`/`S`/`P`) is passed through so the frontend can distinguish current legislators from challengers and presidential candidates.

## Frontend Visualization

### MoneyFlowSection Component

Three-column horizontal layout on desktop:

```
┌────────────┐         ╭──────────╮         ┌────────────┐
│ Top Funders │╌╌╌╌╌╌╌>│   PAC    │╌╌╌╌╌╌╌>│ Recipients │
│             │         │  $173M   │         │            │
│ Musk $80M  │╌╌╌╌╌╌╌>│  AMERICA │╌╌╌╌╌╌╌>│ Lake $12M  │
│ Mellon $5M │╌╌╌╌╌>   │   PAC    │   ╌╌╌╌>│ McCorm $9M │
│ +40 more   │         ╰──────────╯         │ +40 more   │
└────────────┘                               └────────────┘
```

**SVG Bezier curves** connect each card to the center PAC node:
- Stroke width proportional to amount (1-3px)
- Opacity proportional to amount (0.15-0.6)
- Recalculated on mount and window resize via `useLayoutEffect`

**Recipient cards show:**
- Name + party badge (from `PARTY_STYLES`)
- **"Oppose" badge** (red) when IE against > IE for and IE against > direct
- **Red border** on oppose cards for visual distinction
- Spending breakdown: `"Senate · Direct $5K · IE for $40M"`
- Role label: "Senate" (current legislator) vs "Senate candidate" (non-legislator) vs "Presidential"
- Clickable link to representative profile when `bioguideId` exists

**Mobile:** Vertical stack with no SVG curves. Same data, simplified layout.

**Loading:** Skeleton cards in three-column layout matching the component shape.

**Empty state:** Component hidden entirely if no money flow data exists.

## All-Inclusive PAC Queries

The PAC leaderboard and detail queries were updated to include **all candidates**, not just current legislators:

**Before:** `WHERE cand_id IN (SELECT unnest(fec_ids) FROM congress.legislators)` — only counted money going to sitting members of Congress.

**After:** No candidate filter. Counts all PAC-to-candidate and independent expenditure spending, including:
- Presidential candidates
- Challengers who lost
- Retired members
- State/local candidates (if present in FEC data)

Name resolution uses `COALESCE(l.full_name, fc.cand_name)` to fall back to FEC candidate data when the recipient isn't a current legislator.

## Known Limitations

1. **Cross-block merge is heuristic** — Substring employer matching can be fragile. "USA" would match "USA CORP" but also "MEDUSA INC". The state-only fallback could merge unrelated donors who happen to share a common name and state.

2. **Money flow traces top 500 committees only** — Smaller PACs in long chains may not appear in the attribution table.

3. **Proportional attribution is approximate** — Money is fungible; attributing specific dollars through multi-hop paths is inherently an estimate.

4. **Pre-computed vs live data** — Top funders come from a pipeline-computed table (refreshed weekly), while recipients come from live FEC queries. Freshness may differ.

5. **Donor clustering features are incomplete** — `party_split` and `recipient_type` fields in `donor_feature_vectors` are placeholders (hardcoded to 0.0/0.5). Actual computation from contribution history is not yet implemented.
