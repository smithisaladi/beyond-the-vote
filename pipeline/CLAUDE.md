# Pipeline — ETL for Beyond the Ballot

Python data pipeline: FEC campaign finance, Congress.gov legislation, VoteView ideology → Supabase PostgreSQL.

## Commands

| Command | Purpose |
|---------|---------|
| `pip install -r requirements.txt` | Install dependencies |
| `python -m scripts.bulk.bulk_import_legislators` | Bulk: legislators + committees |
| `python -m scripts.bulk.bulk_import_member_scores` | Bulk: VoteView ideology scores |
| `python -m scripts.bulk.bulk_import_bills --congress 118 119` | Bulk: bills from Congress.gov (all bills) |
| `python -m scripts.bulk.bulk_import_votes --congress 118 119` | Bulk: votes (House + Senate) |
| `python -m scripts.bulk.bulk_import_fec` | Bulk: FEC campaign finance (legacy) |
| `python -m scripts.sync.sync_fec` | Sync: FEC via OpenFEC API (weekly) |
| `python -m scripts.sync.sync_legislators` | Sync: incremental legislator update |
| `python -m scripts.sync.sync_bills` | Sync: incremental bill update |
| `python -m scripts.sync.sync_votes` | Sync: incremental vote update |
| `python -m scripts.compute_funding_summaries` | Derive: funding aggregates (DuckDB, local CSVs) |
| `python -m scripts.compute_leaderboard_cache` | Derive: leaderboard cache (Supabase data) |
| `python -m pytest` | Run tests |

## Architecture

- **Bulk scripts** (`scripts/bulk/`): one-time full imports, run manually, checkpoint-resumable
- **Sync scripts** (`scripts/sync/`): incremental updates via watermarks, run by GitHub Actions
- **DuckDB**: in-memory engine that queries local pipe-delimited CSVs for FEC aggregation
- **Supabase**: production database, writes via `supabase-py` service role client
- **`pipeline_runs`** table: tracks every execution with watermark timestamps for incremental fetches
- **`bulk_import_checkpoints`** table: enables resuming bulk imports after failure
- **`bioguide_id`** is the universal legislator key — everything FKs to it
- **`fec_ids`** is an array on legislators — use `ANY()` for joins (GIN index exists)

## Storage Layout

```
data/raw/           — downloaded source files (never modified)
data/processed/     — cleaned outputs from transform/
data/processed/fec/ — pipe-delimited (|) CSVs with headers, queried by DuckDB
```

## Run Order (FK Dependencies)

Bulk imports must follow this sequence:

| Step | Script | Tables |
|------|--------|--------|
| 1 | `bulk_import_legislators` | legislators, committee_memberships |
| 2 | `bulk_import_member_scores` | member_scores (PK: bioguide_id, congress) |
| 3 | `bulk_import_bills --congress 118 119` | bills |
| 4 | `bulk_import_votes --congress 118 119` | bill_vote_summaries, bill_vote_positions |
| 5 | `bulk_import_fec` | pac_to_candidate, independent_expenditures + local CSVs |
| 6 | `compute_funding_summaries` | legislator_funding_summary, legislator_top_pacs, legislator_top_contributors |
| 7 | `compute_leaderboard_cache` | contributor_leaderboard_cache |

## What Goes Where

| Data | Destination | Notes |
|------|-------------|-------|
| legislators, bills, votes, member_scores | Supabase | Core tables |
| pac_to_candidate, independent_expenditures | Supabase + local CSV | Scoped: cycle IN (2024, 2026) |
| legislator_funding_summary, top_pacs, top_contributors | Supabase | Always derived, never source |
| contributor_leaderboard_cache | Supabase | Derived weekly |
| fec_cmte_names | Supabase | cmte_id → name/org lookup |
| candidates CSV, committees CSV | Local only | DuckDB queries these |
| individual_contributions CSV | Local only | ~4GB/cycle, stream only |
| candidate_summaries CSV (webl) | Local only | Source of total_receipts |

## Key Modules

- **`config.py`** — all constants: FEC cycles, column defs, industry keywords, topic mapping, rate limits
- **`utils.py`** — Supabase singleton, batch helper, FEC streaming, API rate limiter (950 req/hr), DuckDB context
- **`load.py`** — upsert, delete_then_insert, pipeline_run logging, checkpoint tracking
- **`transform/`** — one module per data type (bills.py, legislators.py, pac_to_cand.py, etc.)
- **`scripts/bulk/`** — one-time full imports with checkpoint support
- **`scripts/sync/`** — incremental syncs using watermarks from `pipeline_runs`

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role key (write access, bypasses RLS) |
| `CONGRESS_API_KEY` | congress.gov API (1000 req/hr limit) |
| `FEC_API_KEY` | OpenFEC API |

Loaded via `python-dotenv` from `.env` in pipeline root.

## GitHub Actions

| Workflow | Schedule | What |
|----------|----------|------|
| `sync-daily.yml` | 06:00 UTC daily | Legislators + VoteView scores |
| `sync-bills.yml` | Hourly Mon–Fri :30 | Incremental bills |
| `sync-bill-votes.yml` | Hourly Mon–Fri :00 | Incremental votes |
| `sync-weekly.yml` | 07:00 UTC Sundays | sync_fec → compute_leaderboard_cache |

## Supabase Storage Budget (~55MB of 500MB)

| Table | Size |
|-------|------|
| bill_vote_positions | ~15MB |
| pac_to_candidate | ~12MB |
| independent_expenditures | ~10MB |
| bills | ~8MB |
| bill_vote_summaries | ~5MB |
| Everything else | <5MB |

## FEC Gotchas

- FEC bulk files have **no header row** — column positions defined in `config.py` (CN_COLS, CM_COLS, etc.)
- Files are **pipe-delimited** (`|`), not comma-delimited
- Individual contribution files are **~4GB per cycle** — MUST stream line-by-line, never load into memory
- FEC date format is `MMDDYYYY` — use `normalize_fec_date()` from utils
- DuckDB reads CSVs with `read_csv('path', delim='|', header=true, ignore_errors=true)`
- 2026 is the active cycle — `is_active_cycle()` in config.py detects this automatically
- Target cycles: 2024, 2026 (defined in `config.py` as `FEC_CYCLES`)
- Transaction type codes: `24K`/`24Z` → PAC direct, `24E` → IE for, `24A` → IE against

## Congress.gov Gotchas

- Rate limit: **1000 req/hr** — `api_get()` in utils.py enforces 950 threshold
- Full bill import takes **100+ hours** per congress (bulk only)
- House vote `/detail` and `/members` endpoints are **beta** — handle defensively
- Bill summaries often delayed weeks on new bills
- `bill_vote_summaries.id` convention: `{chamber}-{congress}-{roll_call_number}`

## What Claude Should Never Do

- Load full FEC indiv file into memory (will OOM)
- Load `individual_contributions`, `candidates`, or `fec_committees` to Supabase — local-only
- Skip the run order (FK constraints will fail)
- Run `compute_funding_summaries` without local CSVs in `data/processed/fec/`
- Run `refresh_views` mid-pipeline — always at the end
- Modify `db/schema.sql` without being asked — schema changes go in `../supabase/migrations/`
- Hardcode credentials or API keys
- Treat `legislator_funding_summary`, `legislator_top_pacs`, or `legislator_top_contributors` as source tables — always derived

## Testing

```bash
pip install -r requirements-test.txt
python -m pytest
```

Tests in `tests/`. Uses `pytest-mock` and `responses` for HTTP mocking.
