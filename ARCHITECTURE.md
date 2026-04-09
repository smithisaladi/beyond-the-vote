# Beyond the Vote — Architecture Reference

Technical documentation covering the database schema, data pipelines, and API routes.

---

## Table of Contents

- [Database Schema](#database-schema)
  - [User Tables](#user-tables)
  - [Legislative Data](#legislative-data)
  - [Bill & Voting Tables](#bill--voting-tables)
  - [Campaign Finance](#campaign-finance)
  - [Pipeline Monitoring](#pipeline-monitoring)
  - [Database Functions](#database-functions)
  - [Extensions](#extensions)
  - [RLS Policies](#rls-policies)
  - [Relationships](#relationships)
- [Data Pipelines](#data-pipelines)
  - [Architecture Overview](#architecture-overview)
  - [Run Order](#run-order)
  - [Bulk Import Scripts](#bulk-import-scripts)
  - [Derived Data Scripts](#derived-data-scripts)
  - [GitHub Actions Workflows](#github-actions-workflows)
  - [Configuration & Constants](#configuration--constants)
- [API Routes](#api-routes)
  - [Bills](#bills-api)
  - [Politicians](#politicians-api)
  - [Representatives](#representatives-api)
  - [Open Graph Images](#open-graph-images)
  - [External API Integrations](#external-api-integrations)
  - [Caching Strategy](#caching-strategy)
- [Environment Variables](#environment-variables)

---

## Database Schema

Hosted on **Supabase** (PostgreSQL). All legislative/finance tables are public read-only; user tables are RLS-protected to the owning user.

### User Tables

#### `profiles`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | FK → `auth.users` ON DELETE CASCADE |
| `display_name` | TEXT | |
| `avatar_url` | TEXT | |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

Auto-created on signup via `handle_new_user()` trigger.

#### `followed_politicians`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | UUID (PK) | FK → `auth.users` |
| `politician_id` | TEXT (PK) | Bioguide ID |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

#### `tracked_bills`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | UUID (PK) | FK → `auth.users` |
| `bill_id` | TEXT (PK) | Format: `119-hr-4521` |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

#### `topic_preferences`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | UUID (PK) | FK → `auth.users` |
| `topic` | TEXT (PK) | Topic slug |

---

### Legislative Data

#### `legislators`

Primary table anchoring all legislator data. PK: `bioguide_id`.

| Column | Type | Notes |
|--------|------|-------|
| `bioguide_id` | TEXT (PK) | Congress.gov bioguide identifier |
| `lis_id` | TEXT (UNIQUE) | Legislative Information System ID |
| `icpsr_id` | INTEGER | VoteView ICPSR ID |
| `fec_ids` | TEXT[] | Array of FEC candidate IDs (GIN-indexed) |
| `govtrack_id` | TEXT | |
| `thomas_id` | TEXT | |
| `first_name` | TEXT | NOT NULL |
| `last_name` | TEXT | NOT NULL |
| `full_name` | TEXT | NOT NULL |
| `party` | TEXT | Democrat, Republican, or Independent |
| `chamber` | TEXT | House or Senate |
| `state` | TEXT | Two-letter code |
| `state_full` | TEXT | Full state name |
| `district` | INTEGER | House only, nullable |
| `title` | TEXT | Rep or Sen |
| `in_office` | BOOLEAN | DEFAULT TRUE |
| `birthday` | DATE | |
| `gender` | TEXT | |
| `website` | TEXT | |
| `phone` | TEXT | |
| `address` | TEXT | |
| `photo_url` | TEXT | |
| `term_start` | DATE | |
| `term_end` | DATE | |
| `senate_class` | INTEGER | 1, 2, or 3 (Senate only) |
| `next_election` | INTEGER | Election year |
| `twitter` | TEXT | |
| `facebook` | TEXT | |
| `youtube` | TEXT | |
| `fec_committee_id` | TEXT | Principal campaign committee |
| `raw_json` | JSONB | Raw congress.gov data |
| `synced_at` | TIMESTAMPTZ | DEFAULT NOW() |

**Indexes:** `lis_id`, `icpsr_id`, `state`, `chamber`, `fec_ids` (GIN)

#### `member_scores`

DW-NOMINATE ideology scores from VoteView. PK: `(bioguide_id, congress)`.

| Column | Type | Notes |
|--------|------|-------|
| `bioguide_id` | TEXT (PK) | FK → `legislators` |
| `congress` | INTEGER (PK) | 118, 119, etc. |
| `chamber` | TEXT | |
| `nominate_dim1` | NUMERIC(6,3) | -1 (liberal) to +1 (conservative) |
| `nominate_dim2` | NUMERIC(6,3) | |
| `num_votes` | INTEGER | Votes in model |
| `geo_mean_prob` | NUMERIC(6,3) | Goodness of fit |
| `synced_at` | TIMESTAMPTZ | |

#### `committees`

| Column | Type | Notes |
|--------|------|-------|
| `thomas_id` | TEXT (PK) | |
| `name` | TEXT | NOT NULL |
| `chamber` | TEXT | NOT NULL |
| `url` | TEXT | |
| `parent_id` | TEXT | FK → `committees` (self-ref for subcommittees) |

#### `committee_memberships`

| Column | Type | Notes |
|--------|------|-------|
| `bioguide_id` | TEXT (PK) | FK → `legislators` |
| `committee_id` | TEXT (PK) | FK → `committees` |
| `title` | TEXT | Role on committee |

---

### Bill & Voting Tables

#### `bills`

| Column | Type | Notes |
|--------|------|-------|
| `bill_id` | TEXT (PK) | Format: `119-hr-4521` |
| `congress` | INTEGER | |
| `title` | TEXT | NOT NULL |
| `summary` | TEXT | CRS summary |
| `combined_text` | TEXT | Title + summary |
| `bill_number` | TEXT | Display: `H.R. 4521` |
| `topics` | TEXT[] | Topic slugs (GIN-indexed) |
| `status` | TEXT | Active, Committee, Stalled, Passed, Failed |
| `sponsor_name` | TEXT | |
| `sponsor_bioguide_id` | TEXT | |
| `sponsor_party` | TEXT | |
| `introduced_date` | DATE | |
| `policy_area` | TEXT | |
| `congress_gov_url` | TEXT | |
| `last_action_text` | TEXT | |
| `last_action_date` | DATE | |
| `referenced_agencies` | TEXT[] | |
| `referenced_laws` | TEXT[] | |
| `referenced_usc` | TEXT[] | |
| `search_vector` | TSVECTOR | Generated by trigger |
| `synced_at` | TIMESTAMPTZ | |

**Indexes:** `congress`, `search_vector` (GIN), `title` (GIN trigram), `topics` (GIN), `referenced_agencies` (GIN), `referenced_laws` (GIN), `introduced_date DESC`, `policy_area`, `status`

**Trigger:** `bill_embeddings_search_vector_update()` — computes weighted tsvector: title (A), summary (B), sponsor/policy/topics (C), bill_number (D).

**View:** `bill_embeddings` → SELECT * FROM bills (backward compatibility).

#### `bill_vote_summaries`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT (PK) | Format: `{chamber}-{congress}-{roll_call}` |
| `bill_id` | TEXT | NOT NULL |
| `congress` | INTEGER | |
| `chamber` | TEXT | House or Senate |
| `date` | DATE | |
| `question` | TEXT | |
| `result` | TEXT | Passed, Failed, etc. |
| `required` | TEXT | Majority, unanimous consent, etc. |
| `title` | TEXT | |
| `yea_total` | INTEGER | |
| `nay_total` | INTEGER | |
| `present_total` | INTEGER | |
| `not_voting_total` | INTEGER | |
| `yea_democrat` | INTEGER | |
| `nay_democrat` | INTEGER | |
| `yea_republican` | INTEGER | |
| `nay_republican` | INTEGER | |
| `yea_independent` | INTEGER | |
| `nay_independent` | INTEGER | |
| `source_url` | TEXT | |
| `synced_at` | TIMESTAMPTZ | |

**Indexes:** `bill_id`, `date DESC`

#### `bill_vote_positions`

| Column | Type | Notes |
|--------|------|-------|
| `vote_id` | TEXT (PK) | FK → `bill_vote_summaries` |
| `bioguide_id` | TEXT (PK) | FK → `legislators` |
| `position` | TEXT | Yea, Nay, Present, Not Voting |

**Index:** `bioguide_id`

---

### Campaign Finance

#### `pac_to_candidate`

Direct PAC contributions to candidates. PK: `sub_id`.

| Column | Type | Notes |
|--------|------|-------|
| `sub_id` | BIGINT (PK) | FEC submission ID |
| `cmte_id` | TEXT | PAC committee ID |
| `cand_id` | TEXT | FEC candidate ID |
| `transaction_tp` | TEXT | 24K or 24Z |
| `transaction_amt` | NUMERIC(12,2) | Dollars |
| `transaction_dt` | TEXT | MMDDYYYY format |
| `cycle` | SMALLINT | 2024 or 2026 |

**Indexes:** `cmte_id`, `cand_id`, `cycle`

#### `independent_expenditures`

Super PAC independent expenditures. PK: `sub_id`.

| Column | Type | Notes |
|--------|------|-------|
| `sub_id` | BIGINT (PK) | FEC submission ID |
| `cmte_id` | TEXT | Super PAC committee ID |
| `cand_id` | TEXT | |
| `sup_opp` | CHAR(1) | S = support, O = oppose (CHECK constraint) |
| `transaction_tp` | TEXT | 24E (support) or 24A (oppose) |
| `transaction_amt` | NUMERIC(12,2) | |
| `transaction_dt` | TEXT | MMDDYYYY format |
| `cycle` | SMALLINT | |

**Indexes:** `cand_id`, `cycle`

#### `legislator_funding_summary`

Pre-computed funding aggregates. PK: `(bioguide_id, cycle)`. Derived by `compute_funding_summaries.py`.

| Column | Type | Notes |
|--------|------|-------|
| `bioguide_id` | TEXT | FK → `legislators` |
| `cycle` | INT | |
| `total_receipts` | NUMERIC | PAC direct + large individual |
| `pac_direct_total` | NUMERIC | |
| `pac_direct_pct` | NUMERIC | |
| `superpac_ie_for` | NUMERIC | IE supporting candidate |
| `superpac_ie_against` | NUMERIC | IE opposing candidate |
| `large_donor_total` | NUMERIC | Individual >= $200 |
| `large_donor_pct` | NUMERIC | |
| `small_donor_total` | NUMERIC | Unitemized remainder |
| `small_donor_pct` | NUMERIC | |
| `in_state_total` | NUMERIC | |
| `out_of_state_total` | NUMERIC | |
| `out_of_state_pct` | NUMERIC | |
| `dc_donor_total` | NUMERIC | DC donations (lobbyists/staff) |
| `top_industries` | JSONB | `[{"industry": "Finance", "total": 120000, "pct": 34.2}]` |

#### `legislator_top_pacs`

Top 20 PACs per legislator per cycle. PK: `(bioguide_id, cycle, cmte_id)`.

| Column | Type | Notes |
|--------|------|-------|
| `bioguide_id` | TEXT | |
| `cycle` | INT | |
| `cmte_id` | TEXT | |
| `cmte_name` | TEXT | |
| `connected_org` | TEXT | |
| `industry` | TEXT | Classified bucket |
| `direct_contribution` | NUMERIC | |
| `ie_for` | NUMERIC | IE supporting |
| `ie_against` | NUMERIC | IE opposing |
| `total_support` | NUMERIC | direct + ie_for |
| `rank` | INTEGER | 1–20 |

**Index:** `(bioguide_id, cycle)`

---

### Pipeline Monitoring

#### `pipeline_runs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | DEFAULT gen_random_uuid() |
| `script` | TEXT | Script name |
| `phase` | TEXT | Stage within script |
| `bioguide_id` | TEXT | FK → `legislators` ON DELETE SET NULL |
| `status` | TEXT | running, success, or failed (CHECK) |
| `started_at` | TIMESTAMPTZ | DEFAULT NOW() |
| `finished_at` | TIMESTAMPTZ | |
| `result` | JSONB | Row counts, etc. |
| `error` | TEXT | Error message |

**Indexes:** `(script, started_at DESC)`, `(bioguide_id, started_at DESC)`

#### `bulk_import_checkpoints`

Enables resuming bulk imports after failure.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | |
| `script` | TEXT | |
| `source_file` | TEXT | e.g., `candidates_2024` |
| `chunk_index` | BIGINT | |
| `rows_in_chunk` | INT | |
| `status` | TEXT | pending, success, or failed (CHECK) |
| `error` | TEXT | |
| `started_at` | TIMESTAMPTZ | |
| `finished_at` | TIMESTAMPTZ | |

**Unique:** `(script, source_file, chunk_index)`

---

### Database Functions

#### `hybrid_bill_search(query_text, result_limit, offset_count, status_filter, topic_filter, policy_areas, congress_filter)`

Reciprocal Rank Fusion (RRF) combining full-text search and trigram similarity.

- **FTS signal** (weight 1.0): `ts_rank_cd` on weighted `search_vector`, top 40
- **Trigram signal** (weight 0.5): `pg_trgm` similarity on title > 0.1, top 20
- **RRF formula:** `score = 1.0/(60+rank_fts) + 0.5/(60+rank_trgm)`
- Supports filtering by status, topic, policy areas, and congress

#### `lookup_bill(query_text)`

Exact lookup by `bill_id` or `bill_number` (case-insensitive). Returns first match.

#### `get_bills_by_topic(topic_slug, match_count, status_filter)`

Fetches bills where `topics @> ARRAY[topic_slug]` (GIN-indexed).

#### `handle_new_user()`

Trigger on `auth.users` INSERT. Auto-creates `profiles` row.

#### `bill_embeddings_search_vector_update()`

Trigger on `bills` INSERT/UPDATE. Computes weighted tsvector from title, summary, sponsor, policy, topics, and bill_number.

---

### Extensions

- **pg_trgm** — trigram similarity for bill title search
- **pgvector** — created then dropped (no longer used)

### RLS Policies

| Table Group | Policy |
|-------------|--------|
| `profiles`, `followed_politicians`, `tracked_bills`, `topic_preferences` | SELECT/INSERT/UPDATE/DELETE own records only (`auth.uid() = user_id`) |
| All legislative, finance, and pipeline tables | SELECT only (`true`) — public read |

### Relationships

```
profiles.id ──────────────────→ auth.users
followed_politicians.user_id ─→ auth.users
tracked_bills.user_id ────────→ auth.users
topic_preferences.user_id ───→ auth.users

member_scores.bioguide_id ────→ legislators.bioguide_id
committee_memberships.bioguide_id → legislators.bioguide_id
committee_memberships.committee_id → committees.thomas_id
committees.parent_id ──────────→ committees.thomas_id (self-ref)

bill_vote_positions.vote_id ──→ bill_vote_summaries.id
bill_vote_positions.bioguide_id → legislators.bioguide_id

pipeline_runs.bioguide_id ───→ legislators.bioguide_id (SET NULL)
```

---

## Data Pipelines

### Architecture Overview

- **Framework:** Python 3.11+ (pandas, DuckDB, requests, PyYAML, supabase-py)
- **Database:** Supabase PostgreSQL (~55 MB of 500 MB budget)
- **Local processing:** DuckDB in-memory (queries CSV files directly)
- **Orchestration:** GitHub Actions + manual triggers
- **Storage layout:**
  - `pipeline/data/raw/` — original downloaded files (never modified)
  - `pipeline/data/processed/` — cleaned outputs
  - `pipeline/data/processed/fec/` — pipe-delimited CSVs queried by DuckDB

### Run Order

FK dependencies require this exact sequence:

| Step | Script | Output Tables |
|------|--------|---------------|
| 1 | `bulk_import_legislators.py` | `legislators`, `committee_memberships` |
| 2 | `bulk_import_member_scores.py` | `member_scores` |
| 3 | `bulk_import_bills.py --congress 118 119` | `bills` |
| 4 | `bulk_import_votes.py --congress 118 119` | `bill_vote_summaries`, `bill_vote_positions` |
| 5 | `bulk_import_bills.py --congress 118 119 --voted-only` | Prune unvoted bills |
| 6 | `bulk_import_fec.py` | `pac_to_candidate`, `independent_expenditures` + local CSVs |
| 7 | `compute_funding_summaries.py --cycles 2024 2026` | `legislator_funding_summary`, `legislator_top_pacs` |

---

### Bulk Import Scripts

All located in `pipeline/scripts/bulk/`.

#### `bulk_import_legislators.py`

| | |
|---|---|
| **Trigger** | Manual: `python scripts/bulk/bulk_import_legislators.py [--force-download]` |
| **Sources** | [congress-legislators](https://unitedstates.github.io/congress-legislators/) YAML (current + historical) |
| **Output** | `legislators`, `committee_memberships` |
| **Batch size** | 500 rows per upsert |
| **Key logic** | Loads current first (in_office=True takes precedence), then historical. Maps chamber codes, normalizes party, generates photo URLs, extracts committee memberships. |

#### `bulk_import_member_scores.py`

| | |
|---|---|
| **Trigger** | Manual: `python scripts/bulk/bulk_import_member_scores.py [--congress 118 119]` |
| **Sources** | VoteView CSVs: `data/raw/member_scores/HS{congress}_members.csv` |
| **Output** | `member_scores` |
| **Key logic** | Builds `icpsr_id → bioguide_id` map from `legislators` table. Handles UTF-8/latin-1 encodings. |

#### `bulk_import_bills.py`

| | |
|---|---|
| **Trigger** | Manual: `python scripts/bulk/bulk_import_bills.py --congress 118 119 [--voted-only]` |
| **Sources** | Congress.gov API: `/bill/{congress}`, detail, summaries, subjects |
| **Output** | `bills` |
| **Rate limit** | 950 req/hr (safe threshold of 1,000 limit). Full import: 100+ hours/congress. |
| **Checkpointing** | Tracks completed pages in `bulk_import_checkpoints`; can resume after interruption. |
| **Status derivation** | Heuristic rules on `latestAction.text`: "became public law" → Passed, "referred to" → Committee, "failed"/"vetoed" → Failed, etc. |
| **`--voted-only`** | Prunes bills without recorded votes from Supabase. |

#### `bulk_import_votes.py`

| | |
|---|---|
| **Trigger** | Manual: `python scripts/bulk/bulk_import_votes.py --congress 118 119` |
| **Sources** | House: Congress.gov API (beta). Senate: senate.gov XML files. |
| **Output** | `bill_vote_summaries`, `bill_vote_positions` |
| **Processing** | Three-pass: (1) vote summaries with NULL party breakdowns, (2) member positions, (3) UPDATE summaries with computed party counts. |
| **Name resolution** | Pre-builds `lis_id → bioguide_id` and `(last_name, state) → bioguide_id` maps for fallback matching. |

#### `bulk_import_fec.py`

Largest and most complex import. Processes FEC bulk data files.

| | |
|---|---|
| **Trigger** | Manual: `python scripts/bulk/bulk_import_fec.py [--cycles 2024 2026]` |
| **Sources** | FEC bulk downloads: `https://www.fec.gov/files/bulk-downloads/{cycle}/` |
| **Active cycle** | If today's year <= cycle year → active (re-downloads weekly). |

**Processing order** (dependency-driven):

| Step | FEC File | Output | Destination |
|------|----------|--------|-------------|
| 1 | `cn{yy}.zip` (Candidates) | `candidates_{cycle}.csv` | Local CSV only |
| 2 | `cm{yy}.zip` (Committees) | `committees.csv` | Local CSV only |
| 3 | `ccl{yy}.zip` (Linkages) | `cand_id → cmte_id` map | In-memory only |
| 4 | `itpas2{yy}.zip` (PAC/IE) | Split by transaction type | Supabase + local CSV |
| 5 | `indiv{yy}.zip` (Individual) | `individual_contributions_{cycle}.csv` | Local CSV only (filtered) |

**PAC/IE splitting rules:**

| Transaction Type | Target Table | `sup_opp` |
|-----------------|--------------|-----------|
| 24K, 24Z | `pac_to_candidate` | — |
| 24E | `independent_expenditures` | S (support) |
| 24A | `independent_expenditures` | O (oppose) |

**Individual contributions:** Filtered to only committees linked to tracked legislators (~4 GB unzipped per cycle, streamed line-by-line).

---

### Derived Data Scripts

#### `compute_funding_summaries.py`

| | |
|---|---|
| **Trigger** | Manual: `python scripts/compute_funding_summaries.py [--cycles 2024 2026]` |
| **Prerequisite** | All FEC CSVs must exist. Fully idempotent; safe to re-run. |
| **Engine** | DuckDB in-memory (queries local pipe-delimited CSVs via `read_csv()`) |
| **Output** | `legislator_funding_summary`, `legislator_top_pacs` |

**Data flow:**

1. Load legislators from Supabase (bioguide_id, state, fec_ids[])
2. Register FEC CSVs as DuckDB views
3. Build mapping tables: `fec_map`, `cmte_to_bioguide`
4. Execute aggregation queries (PAC direct, Super PAC IE, individual contributions by geography/size)
5. Classify industries via keyword matching (`config.INDUSTRY_KEYWORDS`)
6. Compute top 20 PACs per legislator per cycle (ranked by `total_support = direct + ie_for`)
7. Upsert to Supabase

**Key thresholds:**
- Large donor: >= $200 (FEC itemization line)
- Small donor: `total_receipts - pac_direct - large_donor_itemized`
- DC donors tracked separately (lobbyists/staff proxy)

---

### GitHub Actions Workflows

| Workflow | Schedule | Job |
|----------|----------|-----|
| `sync-daily.yml` | Daily 06:00 UTC | Sync legislators + VoteView scores |
| `sync-bills.yml` | Hourly Mon–Fri at :30 | Incremental bill fetch |
| `sync-bill-votes.yml` | Hourly Mon–Fri at :00 | Incremental vote fetch |

> **Note:** The incremental sync modules (`sync_legislators`, `sync_voteview`, `sync_bills`, `sync_bill_votes`) referenced by these workflows are planned but not yet implemented. Currently only the bulk import scripts exist.

---

### Configuration & Constants

Defined in `pipeline/config.py`:

| Constant | Value |
|----------|-------|
| FEC Cycles | `[2024, 2026]` |
| Cycle → Congress | `{2024: 118, 2026: 119}` |
| CHUNK_SIZE | 50,000 rows (FEC streaming) |
| UPSERT_BATCH | 500 rows (Supabase calls) |
| BILL_PAGE_SIZE | 250 bills per API request |
| Rate limit | 950 req/hr (safe threshold) |
| Large donor threshold | $200 |
| Top PACs limit | 20 per legislator per cycle |
| Industry keywords | 18 buckets (Finance, Defense, Tech, Healthcare, Labor, etc.) |

---

## API Routes

All routes are **public** (no auth required). Supabase uses the anon key for read-only access.

### Bills API

#### `GET /api/bills`

List and search bills with pagination and filtering.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | — | Text search (triggers hybrid RRF search) |
| `status` | string | — | Comma-separated: Active, Committee, Stalled, Passed, Failed |
| `category` | string | — | Comma-separated: Environment, Economy, Healthcare, Defense, Education, Housing, Technology, Immigration |
| `date` | string | — | `month` or `year` |
| `limit` | number | 20 | Max 250 |
| `offset` | number | 0 | Pagination offset |

**Response:**

```json
{
  "bills": [{
    "id": "119-hr-4521",
    "number": "H.R. 4521",
    "title": "...",
    "sponsor": "...",
    "party": "Democrat",
    "status": "Active",
    "category": "Economy",
    "lastAction": "Jan 15, 2026",
    "summary": "..."
  }],
  "pagination": { "total": 42, "limit": 20, "offset": 0 }
}
```

**Data sources:** `bills` table, `hybrid_bill_search` RPC, `legislators` table (sponsor enrichment).

---

#### `GET /api/bills/[id]`

Detailed bill information including votes, sponsor, cosponsors, and actions.

**Path param:** `id` — bill ID (e.g., `119-hr-4521`)

**Response:** Full bill object including:
- Bill metadata (title, number, status, summary, introduced date)
- Sponsor and cosponsors with bioguide IDs
- Policy area and subjects
- Actions timeline (up to 20)
- Votes with full party breakdowns and member positions

**Data sources:** Congress.gov API (bill detail, actions, summaries), `bill_vote_summaries`, `bill_vote_positions`, `legislators`.

**Cache:** 1 hour for Congress.gov fetches.

---

#### `GET /api/bills/search`

Quick bill search for autocomplete/lookup.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string (required) | — | Min 3 chars. Recognizes bill IDs and numbers. |
| `limit` | number | 20 | Max 50 |
| `congress` | number | — | Filter by Congress |

**Data sources:** `lookup_bill` RPC (exact match), `hybrid_bill_search` RPC (fallback).

---

#### `GET /api/bills/by-topic`

Bills for a specific topic.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `slug` | string (required) | — | Topic slug |
| `limit` | number | 20 | Max 100 |
| `status` | string | — | Status filter |

**Data sources:** `get_bills_by_topic` RPC. **Cache:** 5 minutes.

---

### Politicians API

#### `GET /api/politicians/[id]`

Comprehensive politician profile.

**Path param:** `id` — bioguide ID (e.g., `C001075`)

**Response includes:**
- Profile (name, title, party, state, district, contact info, photo)
- Stats (years in office, ideology score/label, bills voted, party loyalty %)
- Recent votes (up to 20) with donor alignment analysis
- Sponsored bills (up to 10)
- Top PAC donors and employer donors
- Funding breakdown (PAC, large individual, small individual, self-funded)
- Committee memberships
- `_sources` field indicating data provenance per section

**Data sources:**
- Supabase: `legislators`, `member_scores`, `bill_vote_positions`, `bill_vote_summaries`, `committee_memberships`, `committees`, `legislator_funding_summary`, `legislator_top_pacs`, `pipeline_runs`
- Congress.gov API: Fallback if legislator not in local DB; sponsored legislation

**Cache:** 1 hour for Congress.gov fetches.

---

#### `GET /api/politicians/search`

Search politicians by name.

| Param | Type | Description |
|-------|------|-------------|
| `q` | string (required) | Min 3 chars |

**Response:** Up to 10 matching legislators with ideology scores.

**Search strategy:** Two parallel queries — `full_name` exact match + `last_name` partial match via `ilike`. Deduped by bioguide_id.

---

### Representatives API

#### `GET /api/representatives`

Find representatives for an address.

| Param | Type | Description |
|-------|------|-------------|
| `address` | string (required) | Full address to geocode |

**Response:** Array of representatives (senators + house rep) with profile data and ideology scores.

**Data sources:**
- **Geocodio API** (`api.geocod.io`): Address → congressional district lookup
- **Congress.gov API**: Profile enrichment
- **Supabase:** `member_scores`

**Cache:** 1 hour. **Errors:** 400 (missing address), 404 (address not found), 500 (API key missing).

---

### Open Graph Images

#### `GET /api/og`

Generates OG image cards (1200x630 PNG) for social sharing. Runs on **Edge Runtime**.

| Param | Type | Description |
|-------|------|-------------|
| `type` | string | `default`, `politician`, or `bill` |
| `name`, `title`, `state`, `party` | string | For `type=politician` |
| `number`, `title`, `status` | string | For `type=bill` |

Party and status colors match the design system.

---

### External API Integrations

| API | Env Var | Rate Limit | Used In |
|-----|---------|------------|---------|
| **Congress.gov** | `CONGRESS_API_KEY` | 1,000 req/hr | Bills detail, politician fallback, sponsored legislation |
| **Geocodio** | `GEOCODIO_API_KEY` | — | Address → district lookup |
| **FEC Bulk Data** | — | N/A (file downloads) | Pipeline only |
| **VoteView** | — | N/A (static CSVs) | Pipeline only |

### Caching Strategy

| Resource | TTL |
|----------|-----|
| Congress.gov API calls | 1 hour |
| Geocodio API calls | 1 hour |
| Bills by topic | 5 minutes |
| All database queries | No cache (fresh on every request) |

---

## Environment Variables

### Application (Next.js)

```
NEXT_PUBLIC_SUPABASE_URL         # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY    # Supabase anon key (public, read-only)
SUPABASE_SERVICE_ROLE_KEY        # Service role key (server-side only)
CONGRESS_API_KEY                 # congress.gov API key
GEOCODIO_API_KEY                 # Geocodio API key
```

### Pipeline (Python)

```
SUPABASE_URL                     # Supabase project URL
SUPABASE_SERVICE_KEY             # Service role key (write access)
CONGRESS_API_KEY                 # congress.gov API key
```
