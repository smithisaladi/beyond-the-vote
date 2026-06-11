# Pipeline — ETL for Beyond the Ballot

Python data pipeline: FEC campaign finance, Congress.gov legislation, VoteView ideology → Neon PostgreSQL.

## Commands

| Command | Purpose |
|---------|---------|
| `uv sync` | Install dependencies |
| `uv run python -m scripts.ingest_all --congress 118 119` | Full import: legislators, bills, votes, FEC, scores |
| `uv run python -m scripts.sync_daily` | Daily sync: bills + votes + embeddings |
| `uv run python -m scripts.sync_weekly` | Weekly sync: FEC API + legislators + VoteView |
| `uv run python -m scripts.sync.sync_legislators` | Sync: incremental legislator update |
| `uv run python -m scripts.sync.sync_bills` | Sync: incremental bill update |
| `uv run python -m scripts.embed_bills` | Generate bill embeddings for semantic search |
| `uv run python -m scripts.enrich_donors --cycles 2024,2026` | Donor entity resolution |
| `uv run python -m scripts.compute_pac_top_funders` | Top funders per PAC (requires donor_canonical) |
| `uv run python -m scripts.enrich_money_flow --cycles 2024,2026` | Money flow tracing (requires pac_top_funders) |
| `uv run python -m scripts.create_schema` | Create database schema |
| `uv run pytest` | Run tests |

## Architecture

- **Database**: Neon PostgreSQL, writes via psycopg2 (`shared/db.py`)
- **Ingest** (`ingest/`): data fetchers — `usc-run` for bills/votes, YAML for legislators, OpenFEC API, VoteView CSV
- **Transform** (`transform/`): one module per data type — normalize, validate, map to DB schema
- **Load** (`load/`): upsert to Postgres via `shared.db.upsert()`
- **Enrich** (`enrich/`): donor entity resolution (`donor_resolution.py`) + money flow tracing (`money_flow.py`)
- **Sync scripts** (`scripts/sync/`): incremental updates via watermarks, run by GitHub Actions
- **DuckDB**: in-memory engine for local FEC CSV/Parquet aggregation (never writes to DB directly)
- **`ops.pipeline_runs`** table: tracks every execution with watermark timestamps for incremental fetches
- **`bioguide_id`** is the universal legislator key — everything FKs to it
- **`fec_ids`** is an array on legislators — use `ANY()` for joins (GIN index exists)

## Storage Layout

```
data/raw/           — downloaded source files (never modified)
data/processed/     — cleaned outputs from transform/
data/processed/fec/ — pipe-delimited (|) CSVs with headers, queried by DuckDB
data/congress-scraper/ — cloned unitedstates/congress repo
data/legislators/   — cloned congress-legislators YAML repo
```

## Run Order (FK Dependencies)

Initial import must follow this sequence:

| Step | Script / Function | Tables |
|------|-------------------|--------|
| 1 | `ingest_all` → legislators | congress.legislators, congress.committee_memberships |
| 2 | `ingest_all` → scores | congress.member_scores |
| 3 | `ingest_all` → bills | congress.bills, congress.bill_cosponsors, congress.bill_actions |
| 4 | `ingest_all` → votes | congress.bill_vote_summaries, congress.bill_vote_positions |
| 5 | `ingest_all` → FEC | fec.pac_to_candidate, fec.independent_expenditures, fec.cmte_names |
| 6 | `embed_bills` | enrichment.bill_embeddings |
| 7 | `enrich_donors` | enrichment.donor_canonical |
| 8 | `compute_pac_top_funders` | derived.pac_top_funders |
| 9 | `enrich_money_flow` | analytics.money_flow_attribution |

## Key Modules

- **`shared/db.py`** — psycopg2 connection (`get_conn()`), `upsert()`, `log_run_start/end()`, `get_watermark()`
- **`config.py`** — all constants: FEC cycles, column defs, topic mapping, rate limits
- **`utils.py`** — batch helper, FEC streaming, API rate limiter (950 req/hr), DuckDB context
- **`ingest/`** — data fetchers (congress.py, legislators.py, fec.py, fec_api.py, voteview.py)
- **`transform/`** — one module per data type (bills.py, legislators.py, votes_house.py, votes_senate.py, etc.)
- **`load/`** — DB writers (bills.py, legislators.py, votes.py, scores.py, fec.py, embeddings.py)
- **`enrich/`** — donor resolution (`donor_resolution.py`), money flow tracing (`money_flow.py`)

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `CONGRESS_API_KEY` | congress.gov API (1000 req/hr limit) |
| `FEC_API_KEY` | OpenFEC API |

Loaded via `python-dotenv` from `.env` in pipeline root.

## GitHub Actions

| Workflow | Schedule | What |
|----------|----------|------|
| `sync-daily.yml` | 06:00 UTC daily | Legislators + VoteView scores + bills + votes |
| `sync-bills.yml` | Hourly Mon–Fri :30 | Incremental bills |
| `sync-weekly.yml` | 07:00 UTC Sundays | FEC API + legislators + VoteView |

## FEC Gotchas

- FEC bulk files have **no header row** — column positions defined in `config.py` (CN_COLS, CM_COLS, etc.)
- Files are **pipe-delimited** (`|`), not comma-delimited
- Individual contribution files are **~4GB per cycle** — MUST stream line-by-line, never load into memory
- FEC date format is `MMDDYYYY` — use `normalize_fec_date()` from utils
- DuckDB reads CSVs with `read_csv('path', delim='|', header=true, ignore_errors=true)`
- Target cycles: 2024, 2026 (defined in `config.py` as `FEC_CYCLES`)
- Transaction type codes: `24K`/`24Z` → PAC direct, `24E` → IE for, `24A` → IE against

## Congress.gov Gotchas

- Rate limit: **1000 req/hr** — `api_get()` in utils.py enforces 950 threshold
- House vote `/detail` and `/members` endpoints are **beta** — handle defensively
- Bill summaries often delayed weeks on new bills
- `bill_vote_summaries.id` convention: `{chamber}-{congress}-{roll_call_number}`

## What Claude Should Never Do

- Load full FEC indiv file into memory (will OOM)
- Load `individual_contributions`, `candidates`, or `fec_committees` to the database — local-only
- Skip the run order (FK constraints will fail)
- Hardcode credentials or API keys

## Testing

```bash
uv run pytest
```

Tests in `tests/`. Uses `pytest-mock` and `responses` for HTTP mocking.
