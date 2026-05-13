# Database Design Trade-offs

A comprehensive audit of every table across the 8 Postgres schemas — what's there, why, what we traded away, and what to watch for.

## Database Overview

**Instance:** Neon PostgreSQL (1.07 GB)
**Extensions:** pg_trgm 1.6, pgvector 0.8.0, plpgsql 1.0
**Schemas:** 8 domain schemas + neon_auth (managed by Neon)
**Tables:** 45 (44 from schema.sql + 1 undocumented)
**Indexes:** 119 total
**Foreign keys:** 14
**Triggers:** 1 (tsvector maintenance on bills)

## Complete Table Inventory

### congress.* — Legislative Source Data (9 tables, ~360 MB)

| Table | Rows | Size | PK | Purpose |
|-------|------|------|----|---------|
| `legislators` | 536 | 1 MB | `bioguide_id` | Universal legislator key; all other tables FK to this |
| `bills` | 15,660 | 51 MB | `bill_id` | Bills with tsvector search, topics array, sponsor FK |
| `bill_vote_summaries` | 1,289 | 1.2 MB | `id` | Roll call vote tallies by party |
| `bill_vote_positions` | 296,620 | 47 MB | `(vote_id, bioguide_id)` | Individual member vote positions |
| `bill_cosponsors` | 147,762 | 28 MB | `(bill_id, bioguide_id)` | Bill cosponsorship records |
| `bill_actions` | 45,611 | 24 MB | `id` (serial) | Bill action timeline |
| `committees` | 85 | 64 KB | `thomas_id` | Committee metadata, self-referential hierarchy |
| `committee_memberships` | 1,329 | 184 KB | `(bioguide_id, committee_id)` | Member committee roles |
| `member_scores` | 2,722 | 344 KB | `(bioguide_id, congress)` | DW-NOMINATE ideology scores per congress |

**Design decisions:**

- **`bioguide_id` as universal key** — Every legislator-related table FKs to `congress.legislators(bioguide_id)`. Alternative was `fec_ids` (FEC candidate IDs), but those are per-election, not per-person. Bioguide is permanent and unique.

- **`fec_ids` as text array** — A legislator can have multiple FEC candidate IDs (one per election, sometimes multiple per cycle). Stored as `text[]` with a GIN index for `ANY()` lookups. Trade-off: array lookups are slower than join tables, but the array is small (1-5 entries) and avoids a junction table for a simple 1:N relationship.

- **`search_vector` maintained by trigger** — The tsvector column on `bills` is auto-updated by a BEFORE INSERT/UPDATE trigger. Trade-off: every bill write incurs trigger overhead (~1ms), but this ensures the search vector is never stale. Application-level maintenance would risk drift.

- **Weighted tsvector** — Title gets weight A (highest), summary B, sponsor/topics C, bill_number D. This means a title match ranks higher than a summary match in `ts_rank_cd`. Trade-off: hardcoded weights can't be tuned without schema change. But the RRF fusion in the search query dilutes any single signal's impact.

- **`bill_vote_positions` composite PK** — `(vote_id, bioguide_id)` ensures one position per member per vote. CASCADE delete from both `bill_vote_summaries` and `legislators` prevents orphans. Trade-off: 296K rows is large for a junction table, but the composite PK is efficient for both join directions.

- **Missing FK: `bill_vote_summaries.bill_id`** — The schema.sql does not define a FK from `bill_vote_summaries.bill_id` to `congress.bills.bill_id`, though the SQLAlchemy model defines the relationship. This means orphaned vote summaries (referencing deleted bills) are possible. Low risk since bills are rarely deleted, but should be added.

### fec.* — Campaign Finance Source Data (4 tables, ~109 MB)

| Table | Rows | Size | PK | Purpose |
|-------|------|------|----|---------|
| `pac_to_candidate` | 756,397 | 95 MB | `sub_id` | Direct PAC contributions to candidates |
| `independent_expenditures` | 84,940 | 12 MB | `sub_id` | Super PAC IE spending (support/oppose) |
| `cmte_names` | 26,245 | 4.5 MB | `cmte_id` | PAC/committee name lookup |
| `candidates` | 13,074 | 2.3 MB | `cand_id` | FEC candidate master (all federal candidates) |

**Design decisions:**

- **`sub_id` as PK** — FEC assigns a unique submission ID to every transaction. This is the natural key and enables idempotent upserts. Trade-off: `sub_id` is a bigint (8 bytes) vs a serial (4 bytes), but it's the authoritative identifier from the source.

- **`sup_opp` as char(1)** — `S` (support) or `O` (oppose) with a CHECK constraint. Trade-off: less readable than an enum, but matches FEC's data format exactly. No translation layer needed during ingestion.

- **No FK from FEC to congress** — `pac_to_candidate.cand_id` and `independent_expenditures.cand_id` have no FK to `congress.legislators`. Intentional: FEC data includes candidates who aren't (or weren't) in Congress — presidential candidates, challengers who lost, retired members. A FK would prevent loading this data.

- **`cmte_names.connected_org`** — Links a PAC to its parent organization (e.g., "COMCAST CORPORATION" for "COMCAST CORPORATION AND NBCUNIVERSAL POLITICAL ACTION COMMITTEE"). Used by `_get_top_contributors` to group PAC contributions by employer. Trade-off: FEC's `connected_org` field is inconsistent (sometimes empty, sometimes the PAC name again). We use `COALESCE(NULLIF(connected_org, ''), cmte_name)` to handle this.

- **`candidates` table was empty until recently** — We only downloaded and loaded the FEC candidate master files (`cn.txt`) during this session. Previously, 61% of money flow destinations were unresolvable. Now down to ~2%. Trade-off: the table stores candidates from both 2024 and 2026 cycles with `cand_id` as PK. If a candidate appears in both cycles with different data, the later cycle's upsert wins.

### enrichment.* — ML-Produced Data (5 tables, ~481 MB)

| Table | Rows | Size | PK | Purpose |
|-------|------|------|----|---------|
| `donor_canonical` | 0* | 104 MB | `canonical_id` | Condensed canonical donors (1 row per person, >$200) |
| `employer_canonical` | 1,332,195 | 309 MB | `id` (serial) | Employer name resolution |
| `employer_industry` | 742,597 | 119 MB | `id` (serial) | Industry classification |
| `donor_address_normalized` | 0 | 32 KB | `id` (serial) | Standardized donor addresses |
| `bill_embeddings` | 15,660 | 53 MB | `bill_id` | 384-dim sentence-transformer vectors |

*Currently running enrichment for both 2024+2026 cycles.

**Design decisions:**

- **Condensed donor schema** — One row per canonical donor, not per contribution. Reduces 80M contributions to ~2-3M donors. Fields: `display_name`, `employer`, `state`, `total_amount`, `contribution_count`, `cmte_ids[]`, `confidence`. Trade-off: individual contribution traceability is lost. Can't answer "which specific $2,700 donation from 2024Q3 belongs to this donor?" without re-deriving from parquet. Accepted because the use case (top funders, clustering) only needs aggregates.

- **`cmte_ids` as text array** — Stores the list of PACs a donor contributed to. Enables unnesting for per-PAC queries. Trade-off: the array doesn't store per-PAC amounts, so `compute_pac_top_funders` must re-join against raw parquet to get per-PAC breakdowns. This avoids bloating the condensed row with JSONB per-PAC data.

- **`confidence` field** — 1.0 (single entry, exact match), 0.85 (within-block clustering), 0.75 (cross-block merge). Consumers can filter: `WHERE confidence >= 0.8` for high-confidence only. Trade-off: the confidence is heuristic, not a real probability. Cross-block merges at $100K+ get 0.75 confidence even though they're almost certainly correct.

- **HNSW index on `bill_embeddings`** — `(m=16, ef_construction=64)` for cosine distance. Trade-off: HNSW is approximate (not exact) nearest-neighbor. At 15K vectors this doesn't matter — the recall is near-perfect. At millions of vectors, the approximation could miss relevant results.

- **384 dimensions for bills, 64 for donors** — Bill embeddings use the full `all-MiniLM-L6-v2` output (384d). Donor feature vectors are UMAP-reduced to 64d. Trade-off: 384d gives better semantic resolution but uses 6x more storage and index space. Bills are searched by users (quality matters); donors are clustered by the pipeline (64d is sufficient for behavioral grouping).

### analytics.* — Pattern Detection (6 tables, ~203 MB)

| Table | Rows | Size | PK | Purpose |
|-------|------|------|----|---------|
| `money_flow_attribution` | 1,074,101 | 203 MB | `id` (serial) | PAC chain flows with proportional attribution |
| `donor_cluster` | 0 | 32 KB | `id` (serial) | HDBSCAN cluster assignments |
| `donor_feature_vectors` | 0 | 32 KB | `canonical_donor_id` | 64-dim UMAP embeddings for similarity |
| `entity_community` | 0 | 32 KB | `id` (serial) | Network community detection (schema only) |
| `entity_centrality` | 0 | 32 KB | `id` (serial) | PageRank/betweenness (schema only) |
| `bundling_events` | 0 | 24 KB | `id` (serial) | Coordinated giving signals (schema only) |

**Design decisions:**

- **`money_flow_attribution` stores pre-computed paths** — Each row records one origin→destination flow with hop count, path array, and attributed amount. Trade-off: 1M rows for 2 cycles is substantial, but it avoids computing graph traversals at API request time. The API reads are simple `WHERE destination_committee_id = :id` with an index.

- **`path` as text array** — Stores intermediate PAC IDs in the flow chain. Enables reconstructing the full path without re-traversing the graph. Trade-off: arrays of varying length are harder to query than fixed columns. But the alternative (a junction table with hop_number) would triple the row count.

- **Top 500 only** — The pipeline traces flows for the 500 highest-inbound committees, not all 8,000+. Trade-off: smaller PACs in long chains are invisible. But the top 500 cover >95% of the total money volume, and tracing all nodes would take hours.

- **Schema-only tables** — `entity_community`, `entity_centrality`, and `bundling_events` have table definitions but no pipeline code to populate them. They're forward declarations for planned features. Trade-off: empty tables cost negligible storage but can confuse developers. Documented as "schema only, not yet implemented."

### anomalies.* — Flagged Patterns (4 tables, 0 bytes)

| Table | Rows | Size | PK | Purpose |
|-------|------|------|----|---------|
| `suspicious_contribution_events` | 0 | 32 KB | `id` (serial) | Straw donor detection |
| `committee_change_points` | 0 | 24 KB | `id` (serial) | Behavioral shift detection |
| `geographic_anomalies` | 0 | 16 KB | `id` (serial) | Unusual donor locations (schema only) |
| `amount_distribution_anomalies` | 0 | 16 KB | `id` (serial) | Limit clustering patterns (schema only) |

**Design decisions:**

- **Separate schema from analytics** — Anomaly results are sensitive (could damage reputations if misinterpreted). Separating them into their own schema enables future access control without restructuring. Trade-off: more schemas to manage.

- **`signals` as JSONB** — Suspicious events store detection signals as JSON (`{"same_day_count": 5, "first_time_ratio": 0.8, ...}`). Trade-off: no schema enforcement on signal keys. But signals evolve as detection improves — JSONB flexibility avoids schema migrations for every new signal type.

### app.* — User Data (4 tables, minimal)

| Table | Rows | Size | PK | Purpose |
|-------|------|------|----|---------|
| `profiles` | 0 | 16 KB | `id` (uuid) | User profiles |
| `followed_politicians` | 2 | 32 KB | `(user_id, politician_id)` | Users tracking legislators |
| `tracked_bills` | 1 | 32 KB | `(user_id, bill_id)` | Users tracking bills |
| `topic_preferences` | 0 | 16 KB | `(user_id, topic)` | User interest topics |

**Design decisions:**

- **UUID for user_id** — Neon Auth (Better Auth) generates UUID user IDs. All app tables use `uuid` as the user FK type. Trade-off: UUIDs are 16 bytes vs 4 bytes for serial, but they match the auth system natively.

- **No user_id FK to a local users table** — `followed_politicians.user_id` is a bare UUID with no FK to `app.profiles`. The user record may not exist in `profiles` yet (created lazily). Trade-off: orphaned follows/tracks are possible if a user is deleted from Neon Auth without cleanup.

### derived.* — Pre-Computed Aggregations (6 tables, ~9.5 GB)

| Table | Rows | Size | PK | Purpose |
|-------|------|------|----|---------|
| `legislator_funding_summary` | 535 | 128 KB | `(bioguide_id, cycle)` | Funding breakdown per legislator |
| `legislator_top_pacs` | 0 | 16 KB | `(bioguide_id, cycle, cmte_id)` | Top PACs per legislator (empty) |
| `legislator_top_contributors` | 0 | 16 KB | `(bioguide_id, cycle, org_name)` | Top orgs per legislator (empty) |
| `pac_top_funders` | 0 | 9.4 GB* | `(cmte_id, cycle, canonical_donor_id)` | Top individual funders per PAC |
| `contributor_leaderboard_cache` | 0 | 40 KB | `cmte_id` | Cached PAC leaderboard (empty) |
| `pac_ai_summaries` | 22 | 72 KB | `cmte_id` | AI-generated PAC summaries |

*`pac_top_funders` shows 9.4 GB because of accumulated dead space from previous runs. A VACUUM would reclaim this.

**Design decisions:**

- **Pre-computed vs live queries** — `legislator_funding_summary` is pre-computed by the pipeline. `_get_top_pacs` and `_get_top_contributors` are live queries (with 24h TTLCache). Trade-off: pre-computed tables are fast but stale (weekly refresh). Live queries are fresh but expensive (full FEC table scan). The hybrid approach gives fast reads for common data and fresh reads for detailed views.

- **`pac_ai_summaries` is undocumented** — This table exists in the live DB but is NOT defined in `schema.sql`. Created at runtime by the `POST /api/donors/{cmte_id}/summary` endpoint. Should be added to `schema.sql` for consistency.

- **`contributor_leaderboard_cache` is empty** — The table exists but is never populated. The PAC leaderboard query runs live against FEC tables on every uncached request. This is the heaviest API query and would benefit from materialization. Listed as a known improvement.

### ops.* — Pipeline Operations (7 tables, minimal)

| Table | Rows | Size | PK | Purpose |
|-------|------|------|----|---------|
| `pipeline_runs` | 18 | 48 KB | `id` (uuid) | Execution history with watermarks |
| `bulk_import_checkpoints` | 0 | 24 KB | `id` (uuid) | Resume points for large imports |
| `ml_models` | 0 | 24 KB | `id` (serial) | Serialized sklearn models (bytea) |
| `donor_overrides` | 0 | 16 KB | `id` (serial) | Manual donor merge corrections |
| `employer_overrides` | 0 | 16 KB | `id` (serial) | Manual employer corrections |
| `industry_overrides` | 0 | 16 KB | `id` (serial) | Manual industry corrections |
| `alembic_version` | 1 | 24 KB | `version_num` | Migration version tracking |

**Design decisions:**

- **Models stored as bytea** — Vote prediction models are joblib-serialized and stored in `ml_models.model_bytes`. Eliminates filesystem dependency on ephemeral containers (Render). Trade-off: can't inspect models without loading them. Maximum model size limited by Postgres bytea (~1GB). Current models are ~1KB each.

- **Override tables** — Manual correction tables for entity resolution. If the algorithm incorrectly merges or splits donors, a human can add an override that the next pipeline run respects. Trade-off: requires manual curation, but provides a safety valve for high-visibility data errors.

## Indexing Strategy

| Index Type | Count | Used For |
|-----------|-------|----------|
| **B-tree (PK + FK)** | 90 | Primary keys, foreign keys, common WHERE clauses |
| **GIN (tsvector)** | 1 | Full-text search on `bills.search_vector` |
| **GIN (trigram)** | 2 | Fuzzy `similarity()` on `bills.title`, `leaderboard_cache.cmte_name` |
| **GIN (array)** | 3 | Array containment on `bills.topics`, `legislators.fec_ids`, `donors.cmte_ids` |
| **HNSW (vector)** | 2 | Cosine nearest-neighbor on `bill_embeddings`, `donor_feature_vectors` |
| **Total** | 119 | |

**Trade-off: HNSW parameters** — `m=16, ef_construction=64` balances index build time against recall quality. Higher `m` improves recall but increases index size linearly. At 15K bill vectors, even low `m` values give near-perfect recall. The default would need tuning if vectors exceed 1M.

## Known Issues

1. **Missing FK:** `bill_vote_summaries.bill_id` → `congress.bills.bill_id` (defined in ORM, missing in DDL)
2. **Undocumented table:** `derived.pac_ai_summaries` exists in DB but not in `schema.sql`
3. **Type mismatch:** `pac_top_funders.confidence` is `real` in schema.sql but `Numeric(5,3)` in SQLAlchemy model
4. **Dead space:** `pac_top_funders` shows 9.4 GB due to accumulated dead rows from previous enrichment runs. Needs VACUUM FULL.
5. **Empty derived tables:** `legislator_top_pacs`, `legislator_top_contributors`, `contributor_leaderboard_cache` are defined but never populated. The API computes these live with TTLCache.
6. **16 tables with no SQLAlchemy model** — All enrichment, analytics, anomalies, and ops tables are accessed via raw SQL only. This is intentional (pipeline uses psycopg2, not SQLAlchemy) but means no ORM-level validation.

## Storage Projections

| Scenario | Estimated Size | Notes |
|----------|---------------|-------|
| Current (2 cycles, partial enrichment) | 1.1 GB | |
| Full enrichment (2 cycles) | ~2.5 GB | donor_canonical + clustering + anomalies |
| All historical cycles (2000-2026) | ~8-12 GB | 13 cycles of FEC data + enrichment |
| With materialized leaderboard cache | +500 MB | Pre-computed PAC rankings |

Neon Pro tier supports up to 50 GB, so all scenarios are within limits.
