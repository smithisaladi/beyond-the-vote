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
| `uv run python -m scripts.enrich_donors --cycles 2024,2026` | Donor entity resolution (full — requires large runner) |
| `uv run python -m scripts.enrich_donors_light` | Light donor dedup (exact-match, standard runner) |
| `uv run python -m scripts.compute_pac_top_funders` | Top funders per PAC (requires donor_canonical) |
| `uv run python -m scripts.enrich_money_flow --cycles 2024,2026` | Money flow tracing (requires pac_top_funders) |
| `uv run python -m scripts.compute_pac_detail_cache` | Pre-compute PAC detail for API |
| `uv run python -m scripts.compute_pac_leaderboard` | Pre-compute PAC leaderboard |
| `uv run python -m scripts.compute_legislator_top_contributors` | Pre-compute top contributors per legislator |
| `uv run python -m scripts.alert --status success` | Send pipeline alert to Slack |
| `uv run python -m scripts.create_schema` | Create database schema |
| `uv run python -m scripts.create_ops_tables` | Create ops infrastructure tables |
| `uv run python -m scripts.create_derived_tables` | Create derived cache tables |
| `uv run alembic -c migrations/alembic.ini upgrade head` | Run database migrations |
| `uv run pytest` | Run tests |

## Architecture

- **Database**: Neon PostgreSQL, writes via psycopg2 (`shared/db.py`)
- **Ingest** (`ingest/`): data fetchers — `usc-run` for bills/votes, YAML for legislators, OpenFEC API, VoteView CSV
- **Transform** (`transform/`): one module per data type — normalize, validate, map to DB schema
- **Load** (`load/`): upsert to Postgres via `shared.db.upsert()`
- **Enrich** (`enrich/`): donor entity resolution (`donor_resolution.py`) + money flow tracing (`money_flow.py`)
- **Sync scripts** (`scripts/sync/`): incremental updates via watermarks, run by GitHub Actions
- **DuckDB**: in-memory engine for local FEC CSV/Parquet aggregation (never writes to DB directly)
- **Ops tables**: `ops.pipeline_runs` (run tracking + watermarks), `ops.data_freshness` (per-table staleness thresholds), `ops.dead_letter` (failed row capture for retry), `ops.pipeline_metrics` (per-step ingestion/duration metrics)
- **Derived tables**: `derived.pac_detail_cache`, `derived.pac_leaderboard`, `derived.legislator_top_contributors` (pre-computed API queries)
- **Shared helpers**: `shared/freshness.py` (staleness tracking), `shared/dead_letter.py` (failed row recording), `shared/metrics.py` (step metrics)
- **Alembic migrations**: `migrations/` is the **single source of truth** (the API has no separate Alembic setup). Run via `alembic -c migrations/alembic.ini upgrade head`. The version table is `ops.alembic_version` (env.py sets `version_table_schema="ops"`); `env.py` imports the API models from `apps/api` for metadata. The ORM models (`apps/api/app/db/models`) now describe the live schema exactly, so `--autogenerate` and `alembic check` are safe — `alembic check` is the drift oracle; run it before committing model/schema changes (a clean run prints `No new upgrade operations detected.`). Caveats: (1) indexes, FK constraints, and unique constraints are **excluded** from comparison (`env.py` `SKIP_TYPES`), so changes to those stay hand-written; (2) any new table in an app-owned schema (`SCHEMA_INCLUDE` in `env.py`) must get a matching ORM model, or autogenerate will propose dropping it. Initial schema is bootstrapped by `create_schema.py` / `create_ops_tables.py` / `create_derived_tables.py`; ongoing changes go through migrations.
- **`bioguide_id`** is the universal legislator key — everything FKs to it
- **`fec_ids`** is an array on legislators — use `ANY()` for joins (GIN index exists)

## Storage Layout

```
data/raw/           — downloaded source files (never modified)
data/processed/     — cleaned outputs from transform/
data/fec/<cycle>/   — FEC bulk converted to Parquet (cm/cn/indiv/pas2.parquet),
                      queried by DuckDB; raw .txt is deleted after conversion
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
| 10 | `compute_funding_summaries` | derived.legislator_funding_summary |
| 11 | `compute_pac_detail_cache` | derived.pac_detail_cache |
| 12 | `compute_pac_leaderboard` | derived.pac_leaderboard |
| 13 | `compute_legislator_top_contributors` | derived.legislator_top_contributors |

## Key Modules

- **`shared/db.py`** — psycopg2 connection (`get_conn()`), `upsert()`, `log_run_start/end()`, `get_watermark()`
- **`config.py`** — all constants: FEC cycles, column defs, topic mapping, rate limits
- **`utils.py`** — batch helper, FEC streaming, API rate limiter (950 req/hr), DuckDB context
- **`ingest/`** — data fetchers (congress.py, legislators.py, fec.py, fec_api.py, voteview.py)
- **`transform/`** — one module per data type (bills.py, legislators.py, votes_house.py, votes_senate.py, etc.)
- **`load/`** — DB writers (bills.py, legislators.py, votes.py, scores.py, fec.py, embeddings.py)
- **`enrich/`** — donor resolution (`donor_resolution.py`), money flow tracing (`money_flow.py`)
- **`shared/freshness.py`** — record/check data freshness per table (staleness thresholds)
- **`shared/dead_letter.py`** — record/retry failed pipeline rows
- **`shared/metrics.py`** — record per-step metrics (rows ingested/upserted, duration)

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `CONGRESS_API_KEY` | congress.gov API (1000 req/hr limit) |
| `FEC_API_KEY` | OpenFEC API |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook for pipeline alerts |

Loaded via `python-dotenv` from `.env` in pipeline root.

## GitHub Actions

| Workflow | Schedule | What |
|----------|----------|------|
| `sync-daily.yml` | 06:00 UTC weekdays | Bills + votes + embeddings |
| `pipeline-weekly.yml` | 07:00 UTC Sundays | Full DAG: ingest → enrich → derived tables → alert (uses `enrich_donors_light`) |
| `test.yml` | On push/PR | Frontend + API + pipeline tests, TypeScript type check |

Full donor resolution (`scripts.enrich_donors`) has no workflow: it OOMs on the
standard GitHub runner (`AgglomerativeClustering` builds an O(n²) matrix per
block) and needs a large runner. The weekly pipeline runs `enrich_donors_light`
(exact-match dedup) instead. Run the full version manually on a large runner.

## FEC Gotchas

- Raw FEC bulk `.txt` have **no header row** — column positions defined in `config.py` (CN_COLS, CM_COLS, etc.)
- Raw files are **pipe-delimited** (`|`), not comma-delimited
- Individual contribution files are **~4GB per cycle** — MUST stream line-by-line, never load into memory
- FEC date format is `MMDDYYYY` — use `normalize_fec_date()` from utils
- `ingest.fec.download_and_convert_all()` downloads the bulk `.txt`, converts to **Parquet** under `data/fec/<cycle>/`, then deletes the `.txt`. Enrichment scripts read that Parquet via DuckDB `read_parquet(...)` — they do **not** read CSVs.
- The Parquet is shared between the donor-resolution (producer) and weekly (restore-only consumer) workflows via the GitHub Actions cache keyed `fec-parquet-*`. A cold cache → enrichment scripts no-op cleanly.
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
