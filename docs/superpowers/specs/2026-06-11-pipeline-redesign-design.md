# Pipeline Redesign: Robust Embeddings + Dead Code Removal + Money Flow Extension

**Date:** 2026-06-11
**Status:** Draft

## Problem

1. Bill embeddings are incomplete/broken — no per-bill error handling, no re-embed when summaries arrive, no completeness validation
2. Pipeline carries dead enrichment code (employer normalization, address standardization, industry classification, donor clustering, anomaly detection, change detection) that has no frontend usage
3. Money flow only traces PAC→PAC→candidate chains; need individual→PAC→candidate to show the full "follow the money" picture

## Scope

**In scope:**
- Fix embedding robustness (error handling, re-embed on summary, validation)
- Strip unused enrichment tiers and API endpoints
- Extend money flow to include individual→PAC edges
- Update schema, scripts, CLAUDE.md files

**Out of scope:**
- Frontend changes to MoneyFlowSection (separate task)
- New data sources or ingestion changes
- Changes to bill/vote/legislator pipeline

---

## Section 1: Embedding Pipeline Robustness

### Changes to `load/embeddings.py`

**Per-bill error handling:**
- Wrap each bill's encoding in try/except
- On failure: log bill_id + error, skip, continue
- Track and report failed bill IDs at end of run

**`has_summary` column on `enrichment.bill_embeddings`:**
- New boolean column, set at embed time based on whether `congress.bills.summary` was non-null
- Each run does two passes:
  1. Embed new bills not in `bill_embeddings` (as today, but skip empty-text bills)
  2. Re-embed bills where `has_summary = false` but `congress.bills.summary IS NOT NULL` (summary arrived since last embed)
- Bills with no title AND no summary are skipped entirely (not embedded)

**Completeness report:**
- After embedding, query `COUNT(*)` from `bill_embeddings` vs `congress.bills WHERE title IS NOT NULL`
- Log coverage percentage
- Warn if < 95%

**Batch logging:**
- Log batch number and bill ID range at start of each batch
- On failure, the log shows exactly which batch and which bill caused the issue

### Schema change

```sql
ALTER TABLE enrichment.bill_embeddings ADD COLUMN has_summary boolean NOT NULL DEFAULT false;
```

---

## Section 2: Dead Code Removal

### Pipeline files to delete

| File | Reason |
|------|--------|
| `enrich/employer_normalization.py` | No frontend usage, no downstream dependency |
| `enrich/address_standardization.py` | No frontend usage |
| `enrich/industry_classification.py` | No frontend usage |
| `enrich/industry_classifier.py` | Only imported by industry_classification |
| `enrich/industry_embeddings.py` | Only imported by industry_classification |
| `enrich/opensecrets.py` | Only imported by industry modules |
| `enrich/stopwords.py` | Only imported by employer_normalization |
| `enrich/donor_clustering.py` | No frontend usage |
| `enrich/suspicious_clusters.py` | No frontend usage |
| `enrich/change_detection.py` | No frontend usage |
| `enrich/vote_prediction.py` | No frontend usage |
| `scripts/enrich_tier1.py` | Replaced by `scripts/enrich_donors.py` |
| `scripts/enrich_tier3.py` | All Tier 3 code stripped |
| `scripts/populate_full.py` | Orchestrated stripped tiers |

### Pipeline files to keep

| File | Reason |
|------|--------|
| `enrich/donor_resolution.py` | Upstream of `pac_top_funders` (used by frontend) |
| `enrich/money_flow.py` | Money flow visualization (used by frontend) |
| `scripts/embed_bills.py` | Bill embeddings |
| `scripts/compute_pac_top_funders.py` | Top funders per PAC (used by frontend) |
| `scripts/compute_funding_summaries.py` | Legislator funding summaries (used by frontend) |

### API files to delete

| File | Reason |
|------|--------|
| `apps/api/app/routers/donor_similarity.py` | No frontend usage |
| `apps/api/app/routers/research.py` | No frontend usage |
| `apps/api/app/routers/ml.py` | No frontend usage (funding-comparison, vote-prediction) |

### API files to update

- `apps/api/app/routers/__init__.py` — remove imports/includes for deleted routers
- `apps/api/app/main.py` — remove router registrations for deleted routers
- `apps/api/app/db/models/enrichment.py` — remove models for dropped tables (keep `BillEmbedding`, `DonorCanonical`)
- `apps/api/app/db/models/derived.py` — remove models for dropped tables (keep `PacTopFunders`, `LegislatorFundingSummary`, etc.)
- `apps/api/app/db/models/__init__.py` — update imports

### Tables to drop from `schema.sql`

**enrichment schema:**
- `enrichment.employer_canonical`
- `enrichment.employer_industry`
- `enrichment.donor_address_normalized`

**analytics schema:**
- `analytics.donor_feature_vectors`
- `analytics.donor_cluster`
- `analytics.entity_community`
- `analytics.entity_centrality`
- `analytics.bundling_events`

**anomalies schema:**
- All tables in `anomalies.*`

### Tables to keep

- `enrichment.bill_embeddings` (fix + add `has_summary`)
- `enrichment.donor_canonical`
- `analytics.money_flow_attribution`
- `derived.pac_top_funders`
- `derived.legislator_funding_summary`
- `derived.pac_ai_summaries`
- All `congress.*`, `fec.*`, `ops.*` tables

---

## Section 3: Money Flow — Individual→PAC→Candidate Extension

### Current state

`enrich/money_flow.py` builds a NetworkX digraph from inter-committee transfers (`fec.pac_to_candidate`), traces paths, and stores flows in `analytics.money_flow_attribution`.

`derived.pac_top_funders` lists top individual donors per PAC but is queried separately by the API — not connected to the flow graph.

### Change

After building the PAC transfer graph, add individual→PAC edges from `derived.pac_top_funders`:
- Each top funder becomes a source node with `entity_type = 'individual'`
- Edge weight = their `total_amount` to that PAC
- These individual→PAC flows are stored in `analytics.money_flow_attribution` alongside PAC→candidate flows

The `money_flow_attribution` table already has `origin_entity_id` and `origin_entity_type` columns, so no schema change needed — just populate with individual-type rows.

### Dependency order

`enrich_donors` (donor resolution) → `compute_pac_top_funders` → `enrich_money_flow` (now reads pac_top_funders for individual nodes)

---

## Section 4: Pipeline Architecture Cleanup

### New scripts

| Old | New | What it runs |
|-----|-----|-------------|
| `scripts/enrich_tier1.py` | `scripts/enrich_donors.py` | Donor resolution only |
| `scripts/enrich_tier2.py` | `scripts/enrich_money_flow.py` | Money flow only (with individual→PAC edges) |
| `scripts/enrich_tier3.py` | (deleted) | — |
| `scripts/populate_full.py` | (deleted) | — |

### New enrichment run order

```
1. embed_bills              → enrichment.bill_embeddings     (independent)
2. enrich_donors            → enrichment.donor_canonical     (requires FEC parquets)
3. compute_pac_top_funders  → derived.pac_top_funders        (requires donor_canonical)
4. enrich_money_flow        → analytics.money_flow_attribution (requires pac_top_funders + FEC)
```

Steps 2→3→4 are sequential. Step 1 is independent and can run in parallel.

### Updates to sync scripts

- `sync_daily.py` — remove any Tier 1/2/3 calls, ensure embed_bills is called
- `sync_weekly.py` — update to call `enrich_donors` → `compute_pac_top_funders` → `enrich_money_flow` instead of old tier scripts

### Updates to GitHub Actions

- Update workflow files to reference new script names

### Updates to CLAUDE.md files

- `pipeline/CLAUDE.md` — update commands table, run order, key modules, remove tier references
- Root `CLAUDE.md` — update pipeline section if referenced

---

## Files Changed Summary

### Deleted (pipeline)
- `enrich/employer_normalization.py`
- `enrich/address_standardization.py`
- `enrich/industry_classification.py`
- `enrich/industry_classifier.py`
- `enrich/industry_embeddings.py`
- `enrich/opensecrets.py`
- `enrich/stopwords.py`
- `enrich/donor_clustering.py`
- `enrich/suspicious_clusters.py`
- `enrich/change_detection.py`
- `enrich/vote_prediction.py`
- `scripts/enrich_tier1.py`
- `scripts/enrich_tier3.py`
- `scripts/populate_full.py`

### Deleted (API)
- `apps/api/app/routers/donor_similarity.py`
- `apps/api/app/routers/research.py`
- `apps/api/app/routers/ml.py`

### Created
- `scripts/enrich_donors.py` (thin wrapper calling donor_resolution)
- `scripts/enrich_money_flow.py` (thin wrapper calling money_flow)

### Modified
- `load/embeddings.py` — per-bill error handling, has_summary re-embed, completeness validation
- `enrich/money_flow.py` — add individual→PAC edges from pac_top_funders
- `schema.sql` — drop unused tables, add `has_summary` column
- `sync_daily.py`, `sync_weekly.py` — update script references
- `apps/api/app/routers/__init__.py` / `main.py` — remove deleted router registrations
- `apps/api/app/db/models/enrichment.py` — remove models for dropped tables
- `apps/api/app/db/models/__init__.py` — update imports
- `pipeline/CLAUDE.md` — update commands, run order, modules
- GitHub Actions workflow files
- `enrich/__init__.py` — clean up imports
