# Pipeline

A Python ETL pipeline that ingests FEC campaign finance data, congressional
legislation, and legislator data into Supabase (PostgreSQL) to power a
political transparency website.

## What This Project Does
Tracks money flows from donors → PACs/Super PACs → candidates/legislators,
cross-referenced with voting records and ideology scores.

## Tech Stack
- Python 3.11+
- Supabase (PostgreSQL) via supabase-py client
- DuckDB for local FEC aggregation (queries CSV files directly, no separate DB)
- pandas for transforms
- requests + PyYAML for data fetching
- GitHub Actions for scheduling

## Architecture
- Raw FEC and congressional data is processed entirely on the local machine
- Supabase receives only derived, frontend-ready tables (~55MB of 500MB budget)
- `individual_contributions`, `candidates`, `fec_committees` NEVER load to Supabase — too large or only needed for local aggregation
- All donor aggregation happens locally via DuckDB in `compute_funding_summaries.py`
- DuckDB queries pipe-delimited CSVs in `data/processed/fec/` directly — no persistent database file
- `legislator_funding_summary` and `legislator_top_pacs` are the only FEC-derived tables in Supabase

## Supabase Storage Budget (~55MB of 500MB used)
| Table                        | Estimated Size |
|------------------------------|---------------|
| legislators                  | <1MB          |
| member_scores                | <1MB          |
| bills (scoped, no text)      | ~8MB          |
| bill_vote_summaries          | ~5MB          |
| bill_vote_positions          | ~15MB         |
| pac_to_candidate (scoped)    | ~12MB         |
| independent_expenditures     | ~10MB         |
| legislator_funding_summary   | <1MB          |
| legislator_top_pacs          | ~2MB          |
| pipeline_runs + checkpoints  | <1MB          |

## Scoping Rules (enforced in load scripts)
- `individual_contributions`: LOCAL CSV ONLY — never loaded to Supabase
- `candidates`: LOCAL CSV ONLY — dropped from Supabase
- `fec_committees`: LOCAL CSV ONLY (`committees.csv`) — dropped from Supabase
- `pac_to_candidate`: Supabase + local CSV, cycle IN (2024, 2026)
- `independent_expenditures`: Supabase + local CSV, cycle IN (2024, 2026)
- `bills`: only WHERE bill_id has a recorded vote (use `--voted-only` flag after votes load)
- `bills`: `combined_text` excluded — search_vector trigger computes from title/summary/sponsor/topics
- `legislator_top_pacs`: top 20 PACs per legislator per cycle only

pipeline/
├── CLAUDE.md
├── .claude/
│   ├── settings.json
│   └── commands/
│       ├── bulk-import.md
│       ├── sync.md
│       ├── check-pipeline.md
│       └── refresh-views.md
├── data/
│   ├── raw/
│   │   ├── fec/
│   │   │   ├── 2024/
│   │   │   │   ├── cn24.zip
│   │   │   │   ├── cm24.zip
│   │   │   │   ├── ccl24.zip
│   │   │   │   ├── indiv24.zip
│   │   │   │   ├── pas224.zip
│   │   │   │   ├── webl24.zip
│   │   │   │   └── webk24.zip
│   │   │   └── 2026/
│   │   │       ├── cn26.zip
│   │   │       ├── cm26.zip
│   │   │       ├── ccl26.zip
│   │   │       ├── indiv26.zip
│   │   │       ├── pas226.zip
│   │   │       ├── webl26.zip
│   │   │       └── webk26.zip
│   │   ├── legislators/
│   │   │   ├── legislators-current.yaml
│   │   │   └── legislators-historical.yaml
│   │   ├── member_scores/
│   │   │   └── HS{xyz}_members.csv
│   │   ├── bills/
│   │   │   ├── 118/
│   │   │   └── 119/
│   │   └── votes/
│   │       ├── house/
│   │       │   ├── 118/
│   │       │   └── 119/
│   │       └── senate/
│   │           ├── 2023/
│   │           ├── 2024/
│   │           ├── 2025/
│   │           └── 2026/
│   └── processed/
│       ├── fec/
│       ├── legislators/
│       ├── member_scores/
│       ├── bills/
│       └── votes/
├── scripts/
│   ├── bulk/
│   │   ├── bulk_import_legislators.py
│   │   ├── bulk_import_member_scores.py
│   │   ├── bulk_import_bills.py
│   │   ├── bulk_import_votes.py
│   │   └── bulk_import_fec.py
│   ├── sync/
│   │   ├── sync_legislators.py
│   │   ├── sync_member_scores.py
│   │   ├── sync_bills.py
│   │   ├── sync_votes.py
│   │   └── sync_fec.py
│   ├── compute_funding_summaries.py
│   ├── refresh_views.py
│   └── run.py
├── transform/
│   ├── legislators.py
│   ├── member_scores.py
│   ├── bills.py
│   ├── votes_house.py
│   ├── votes_senate.py
│   ├── candidate_summaries.py
│   ├── candidates.py
│   ├── committees.py
│   ├── candidate_committee_linkages.py
│   ├── individuals.py
│   ├── pac_to_cand.py
│   └── ind_exp.py
├── db/
│   ├── schema.sql
│   └── views.sql
├── config.py
├── load.py
├── utils.py
├── requirements.txt
└── .github/
    └── workflows/
        ├── sync-daily.yml
        └── sync-weekly.yml

## Key Architecture Decisions
- `bioguide_id` is the universal legislator key — everything FKs to it
- `fec_ids` is an array on legislators — use `ANY()` for joins, GIN index exists
- `member_scores` PK is `(bioguide_id, congress)` — not just bioguide_id
- Bulk imports and sync jobs are separate scripts with different strategies
- Watermarks live in `pipeline_runs` table in Supabase
- Bulk checkpoints live in `bulk_import_checkpoints` table
- 2026 is the active FEC cycle — treated as partial load, not historical
- `legislator_funding_summary` and `legislator_top_pacs` are always derived, never loaded from source
- FEC source tables (`individual_contributions`, `candidates`, `fec_committees`) live only as local CSVs — dropped from Supabase

## Database Tables (Supabase)
- `legislators`                   — bioguide anchor, fec_ids[], social links
- `member_scores`                 — DW-NOMINATE per (bioguide_id, congress)
- `bills`                         — congress.gov metadata (scoped to voted-on bills, no combined_text)
- `bill_vote_summaries`           — roll call results with party breakdowns
- `bill_vote_positions`           — individual member votes, FK to legislators
- `pac_to_candidate`              — PAC direct contributions to candidates
- `independent_expenditures`      — Super PAC outside spending
- `legislator_funding_summary`    — pre-computed funding metrics per legislator per cycle
- `legislator_top_pacs`           — top 20 PACs per legislator per cycle (derived)
- `pipeline_runs`                 — watermarks and job status
- `bulk_import_checkpoints`       — chunk-level progress for bulk jobs

## Local-Only Tables (CSV in data/processed/fec/)
- `candidates_{cycle}.csv`                — FEC candidate master, used for ID resolution
- `candidate_summaries_{cycle}.csv`       — FEC candidate financial totals (webl), used for total_receipts/small donor
- `committees.csv`                        — FEC committee master, used for industry classification
- `individual_contributions_{cycle}.csv`  — donor → committee, filtered to tracked legislators
- `pac_to_candidate_{cycle}.csv`          — PAC contributions (also in Supabase)
- `independent_expenditures_{cycle}.csv`  — Super PAC IE (also in Supabase)

## `legislator_funding_summary` Schema
```sql
CREATE TABLE legislator_funding_summary (
  bioguide_id           TEXT,
  cycle                 INT,

  -- Totals
  total_receipts        NUMERIC,

  -- PAC / Corporate
  pac_direct_total      NUMERIC,
  pac_direct_pct        NUMERIC,
  superpac_ie_for       NUMERIC,
  superpac_ie_against   NUMERIC,

  -- Individual donors
  large_donor_total     NUMERIC,  -- itemized individuals >= $200
  large_donor_pct       NUMERIC,
  small_donor_total     NUMERIC,  -- unitemized remainder (ttl_indiv_contrib - large_donor)
  small_donor_pct       NUMERIC,

  -- Party & Self-funded
  pol_pty_total         NUMERIC,  -- party committee contributions
  pol_pty_pct           NUMERIC,
  self_funded_total     NUMERIC,  -- candidate self-contributions
  self_funded_pct       NUMERIC,
  other_total           NUMERIC,  -- transfers, loans, misc (remainder)
  other_pct             NUMERIC,

  -- Geographic
  in_state_total        NUMERIC,
  out_of_state_total    NUMERIC,
  out_of_state_pct      NUMERIC,
  dc_donor_total        NUMERIC,  -- DC tracked separately — disproportionately lobbyists

  -- Industry
  top_industries        JSONB,    -- [{"industry": "Finance", "total": 120000, "pct": 34.2}, ...]

  PRIMARY KEY (bioguide_id, cycle)
);
```

## `legislator_top_pacs` Schema
```sql
CREATE TABLE legislator_top_pacs (
  bioguide_id         TEXT,
  cycle               INT,
  cmte_id             TEXT,
  cmte_name           TEXT,
  connected_org       TEXT,
  industry            TEXT,
  direct_contribution NUMERIC,   -- from pac_to_candidate
  ie_for              NUMERIC,   -- from independent_expenditures SUP_OPP = S
  ie_against          NUMERIC,   -- from independent_expenditures SUP_OPP = O
  total_support       NUMERIC,   -- direct_contribution + ie_for
  rank                INTEGER,   -- 1 = biggest supporter
  PRIMARY KEY (bioguide_id, cycle, cmte_id)
);
```

## Funding Summary Computation
- `legislator_funding_summary` and `legislator_top_pacs` are computed by `compute_funding_summaries.py`
- They are never loaded from a raw source — always derived from local FEC CSVs via DuckDB
- Re-running is safe and fully idempotent — rows are replaced each run
- DuckDB queries `data/processed/fec/*.csv` files directly (pipe-delimited, with headers)
- Legislators are loaded from Supabase (small table); all FEC data from local CSVs
- **total_receipts** sourced from `candidate_summaries_{cycle}.csv` (webl file) — the FEC-reported total
- **Six funding categories** sum to ~100% of total_receipts:
  1. PAC & Corporate (`pac_direct_pct`) — FEC `other_pol_cmte_contrib` from webl
  2. Large Individual (`large_donor_pct`) — itemized individual contributions >= $200
  3. Small Donors (`small_donor_pct`) — FEC `ttl_indiv_contrib` minus large donors
  4. Party (`pol_pty_pct`) — FEC `pol_pty_contrib` from webl
  5. Self-Funded (`self_funded_pct`) — FEC `cand_contrib` from webl
  6. Other (`other_pct`) — remainder (transfers, loans, misc)
- Falls back to sum of known sources (pac + large_donor) if webl data is missing
- Industry buckets are defined in `config.py` as `INDUSTRY_KEYWORDS`
- Industry is derived from `connected_org` on the committee master file
- Unclassified PACs go into an "Other" bucket
- Out-of-state is derived from `individual_contributions.state` vs `legislators.state`
- DC donors tracked separately — disproportionately lobbyists and staff
- `top_industries` stored as JSONB — fully replaced each pipeline run
- `legislator_top_pacs` stores top 20 PACs per legislator per cycle
- Large donor threshold: itemized individual contributions >= $200 (FEC disclosure line)

## Run Order (Critical)
Always run in this order — FK dependencies will break if violated:
1.  legislators                        → Supabase
2.  member_scores                      → Supabase
3.  bills (all)                        → Supabase
4.  bill_vote_summaries (partial)      → Supabase (party breakdown NULL)
5.  bill_vote_positions                → Supabase
6.  bill_vote_summaries (update pass)  → Supabase (compute party breakdown)
7.  bills --voted-only                 → prune unvoted bills from Supabase
8.  FEC bulk_import_fec.py             → local CSVs + Supabase (pac/ie only)
    - candidates                       → local CSV only
    - committees                       → local CSV only
    - candidate_summaries (webl)       → local CSV only
    - pac_to_candidate                 → Supabase + local CSV
    - independent_expenditures         → Supabase + local CSV
    - individual_contributions         → local CSV only
9.  compute_funding_summaries          → reads local CSVs via DuckDB → Supabase
    - legislator_funding_summary       → Supabase
    - legislator_top_pacs              → Supabase
10. refresh_views

## FEC Cycles
- Target cycles: 2024, 2026
- Defined in config.py as FEC_CYCLES = [2024, 2026]

## FEC Cycle → Congress Mapping
- 2024 → Congress 118
- 2026 → Congress 119

## Congress Session Mapping
- Congress 118, Session 1 → 2023
- Congress 118, Session 2 → 2024
- Congress 119, Session 1 → 2025
- Congress 119, Session 2 → 2026

## FEC Active Cycle Behavior
2026 is the active cycle. bulk_import_fec.py detects this automatically via
date comparison and switches to partial load mode — weekly re-download of
full file, filter by watermark, upsert. No manual intervention needed.
When 2026 closes post-election, it will automatically switch to full
historical mode on next run.

## Data Layout
- data/raw/             — original downloaded files, never modified
- data/processed/       — cleaned outputs from transform/
- data/processed/fec/   — pipe-delimited CSVs with headers, queried by DuckDB
  - candidates_{cycle}.csv, candidate_summaries_{cycle}.csv, committees.csv — local-only, never in Supabase
  - individual_contributions_{cycle}.csv   — local-only (~1-2GB per cycle, filtered)
  - pac_to_candidate_{cycle}.csv           — also loaded to Supabase
  - independent_expenditures_{cycle}.csv   — also loaded to Supabase
- Raw FEC files are named by FEC convention: cn{yy}.zip, cm{yy}.zip, webl{yy}.zip, webk{yy}.zip, etc.
- Always download to data/raw/ before processing — never process in-memory downloads
- Never delete data/processed/ — it is the full local archive

## Data Sources
- Legislators:     https://unitedstates.github.io/congress-legislators/legislators-current.yaml
- Historical:      https://unitedstates.github.io/congress-legislators/legislators-historical.yaml
- Member scores:   data/raw/member_scores/HS{xyz}_members.csv
- Bills:           https://api.congress.gov/v3/bill
- House votes:     https://api.congress.gov/v3/house-vote/{congress}/{session}
- Senate votes:    https://www.senate.gov/legislative/LIS/roll_call_lists/
- FEC bulk:        https://www.fec.gov/data/browse-data/?tab=bulk-data

## FEC File Reference
| File          | Destination                                   | Notes                                              |
|---------------|-----------------------------------------------|----------------------------------------------------|
| cn{yy}.zip    | local CSV only                                | No header row; dropped from Supabase               |
| cm{yy}.zip    | local CSV only                                | No header row; dropped from Supabase               |
| ccl{yy}.zip   | in-memory only                                | Links cand_id to principal campaign committee_id   |
| indiv{yy}.zip | local CSV only                                | ~4GB unzipped, stream only, never in Supabase      |
| pas2{yy}.zip  | Supabase + local CSV                          | Split by transaction type code in transform layer  |
| webl{yy}.zip  | local CSV only                                | Candidate financial summary; provides total_receipts |
| webk{yy}.zip  | not used yet                                  | Committee financial summary; reserved for future use |
| oth{yy}.zip   | not used                                      | PAC-to-PAC only — skip unless needed later         |

## pas2 Transaction Type Codes
- 24K, 24Z → direct PAC contribution → pac_to_candidate
- 24E       → independent expenditure FOR candidate → independent_expenditures (sup_opp = S)
- 24A       → independent expenditure AGAINST candidate → independent_expenditures (sup_opp = O)
## Committee Type Codes
- Q, N, V, W — PAC types (direct contribution eligible)
- O           — Super PAC
- U           — Single-candidate Super PAC

## Environment Variables
- SUPABASE_URL          — Supabase project URL
- SUPABASE_SERVICE_KEY  — Supabase service role key (not anon key)
- FEC_API_KEY           — from api.open.fec.gov
- CONGRESS_API_KEY      — from api.congress.gov (1,000 req/hour free tier)

## Commands
```bash
pip install -r requirements.txt
python scripts/run.py                              # run all sync jobs
python scripts/bulk/bulk_import_legislators.py     # one-time legislator load
python scripts/bulk/bulk_import_member_scores.py   # one-time scores load
python scripts/bulk/bulk_import_bills.py --congress 118 119
python scripts/bulk/bulk_import_bills.py --congress 118 119 --voted-only  # prune unvoted bills
python scripts/bulk/bulk_import_votes.py --congress 118 119
python scripts/bulk/bulk_import_fec.py             # FEC load → local CSVs + Supabase (pac/ie)
python scripts/compute_funding_summaries.py        # DuckDB aggregation → funding_summary + top_pacs
```

## Custom Claude Code Commands
- /bulk-import [source]   — run a one-time bulk import
- /sync [source|all]      — run incremental sync jobs
- /check-pipeline         — health check, row counts, watermark status
- /refresh-views          — manually refresh materialized views

## Vote Source by Chamber
House votes use the congress.gov API exclusively:
- Paginate /house-vote/{congress}/{session} to discover vote numbers
- Fetch /house-vote/{congress}/{session}/{voteNumber} for summaries
- Fetch /house-vote/{congress}/{session}/{voteNumber}/members for positions
- Detail and /members endpoints are beta — wrap in defensive error handling,
  log unexpected schema changes, fall back to clerk.house.gov XML if malformed

Senate votes use senate.gov XML:
- Download index per year from senate.gov/legislative/LIS/roll_call_lists/
- Parse XML per vote file
- Resolve bioguide_id from member name matching against legislators table

## Gotchas
- FEC files have no header row — column names must be supplied manually from FEC data dictionary
- congress.gov API rate limit is 1,000 req/hour — bulk bill import takes 100+ hours
- VoteView bioguide_id is inconsistent in older records — validate on load
- bill_vote_summaries party breakdown must be computed AFTER bill_vote_positions loads
- FEC indiv file is ~4GB unzipped per cycle — always stream line-by-line, never load to memory
- bill_vote_summaries.id convention: {chamber}-{congress}-{roll_call_number}
- FEC indiv/pas2/itoth files replace weekly for active cycle — download fresh each sync run
- congress.gov bill summaries are often delayed weeks on new bills
- congress.gov /house-vote detail and /members endpoints are beta — handle defensively
- Member scores filename pattern is HS{xyz}_members.csv where {xyz} is the congress number
- compute_funding_summaries.py must run after ALL FEC CSVs are written — never mid-pipeline
- DC donor state code is "DC" in individual_contributions
- Local FEC CSVs are pipe-delimited (`|`) to avoid comma-in-name issues
- DuckDB reads CSVs with `read_csv('path', delim='|', header=true, ignore_errors=true)`
- `candidates` and `fec_committees` tables no longer exist in Supabase — only local CSVs
- `bills.combined_text` is no longer populated — search_vector trigger computes from title/summary/sponsor/topics

## What Claude Should Never Do
- Modify schema.sql without being asked — schema changes go in
  ../supabase/migrations/ not inside pipeline/
- Hardcode credentials or API keys
- Load full FEC indiv file into memory
- Load `individual_contributions`, `candidates`, or `fec_committees` to Supabase — they are local-only
- Run refresh_views mid-pipeline — always at the end after all jobs succeed
- Run compute_funding_summaries without local CSVs present in data/processed/fec/
- Process a partial or unverified download
- Treat `legislator_funding_summary` or `legislator_top_pacs` as source tables — they are always derived
