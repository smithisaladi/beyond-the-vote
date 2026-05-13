# Data Engineering Questions

Deep-dive questions about the ETL pipeline, data modeling, and campaign finance data processing.

---

## Q1: Explain the 3-tier ML enrichment architecture. Why tiers instead of a flat pipeline?

**Answer:**

The enrichment pipeline has strict data dependencies:

```
Tier 1 (Entity Resolution)        Tier 2 (Pattern Detection)       Tier 3 (Anomaly Detection)
─────────────────────────         ──────────────────────────       ────────────────────────────
donor_resolution          ──┐
employer_normalization    ──┼──>  donor_clustering           ──┐
industry_classification   ──┤     (includes feature vectors)  ──┼──> suspicious_clusters
address_standardization   ──┘     money_flow                  ──┘    change_detection
```

**Tier 1** resolves raw, messy data into clean entities. You can't cluster donors (Tier 2) until you know which contributions belong to the same person (Tier 1). You can't detect suspicious contribution patterns (Tier 3) until you've resolved donor identities (Tier 1) and built behavioral clusters (Tier 2).

**Why not a flat dependency graph?** The tiers provide natural execution boundaries:
- Tier 1 can be re-run independently when entity resolution improves
- Tier 2 depends only on Tier 1 outputs — you can re-cluster without re-resolving
- Tier 3 is the most experimental — anomaly thresholds change frequently without affecting upstream

> **Note:** The schema also defines tables for future Tier 2/3 features (bundling detection, network community detection, geographic/amount anomalies) that don't have pipeline code yet.

**Operational benefit:** `scripts/enrich_tier1.py`, `enrich_tier2.py`, `enrich_tier3.py` can be run independently. The weekly pipeline runs all three in sequence, but during development you can iterate on Tier 3 anomaly detection without waiting for Tier 1+2.

---

## Q2: How does donor entity resolution work? What makes it hard?

**Answer:**

FEC individual contribution records include a name, employer, and address — but no unique ID. The same person can appear hundreds of different ways:

```
"JOHN A SMITH"       / "ACME CORP"     / "123 MAIN ST, NY 10001"
"SMITH, JOHN"        / "ACME CORP INC" / "123 MAIN STREET, NEW YORK 10001"
"JON SMITH"          / "ACME"          / "PO BOX 456, NY 10001"
"JOHN SMITH JR"      / "ACME CORP."    / "123 MAIN, NEW YORK 10001"
```

**The pipeline approach:**

1. **Feature extraction:** For each contribution, create a feature vector from:
   - Normalized name (lowercase, remove suffixes, standardize formats)
   - Normalized employer (after `employer_normalization` runs)
   - ZIP5 (first 5 digits of ZIP code)
   - State

2. **TF-IDF vectorization:** Convert name + employer strings into TF-IDF vectors. This captures the important tokens while down-weighting common words.

3. **Cosine similarity clustering:** Group contributions where the feature vector similarity exceeds a threshold. Each cluster gets a `canonical_id`.

4. **Confidence scoring:** Each assignment gets a confidence score (0-1). Low-confidence matches can be reviewed via `ops.donor_overrides`.

**What makes it hard:**
- **Name variations:** "JON" vs "JOHN", "SMITH JR" vs "SMITH" — requires fuzzy matching
- **Address changes:** People move. A donor in NY in 2020 might be in CA in 2024
- **Employer changes:** Same person, different employer — harder to match
- **Common names:** "John Smith" with no other distinguishing features
- **Scale:** Millions of contributions, O(n^2) pairwise comparison is infeasible — need blocking/hashing strategies

**Trade-offs:**
- High threshold → fewer false positives, but misses legitimate matches
- Low threshold → more matches, but may merge distinct people
- The confidence score lets downstream consumers choose their own threshold

---

## Q3: How does the money flow graph work? What does it reveal?

**Answer:**

Campaign finance involves complex PAC-to-PAC transfers before money reaches candidates. The money flow module traces these chains:

```
Individual → PAC A → PAC B → PAC C → Candidate
             hop 1    hop 2    hop 3
```

**How it works:**

1. **Build the graph:** Load `fec.pac_to_candidate` and PAC-to-PAC transfers into a NetworkX directed graph. Nodes are entities (PACs, candidates), edges are transfers with amounts.

2. **Traverse:** For each destination (candidate or PAC), walk backwards through the graph up to `depth` hops, recording:
   - Origin entity and type
   - Attributed amount (proportional to the path)
   - Hop count
   - Full path (array of intermediate entity IDs)

3. **Store:** Results go into `analytics.money_flow_attribution`

**API exposure:**
```
GET /api/money-flow/C00123456?direction=inbound&depth=3
```
Returns a graph with nodes (entities) and edges (money flows) that the frontend can visualize.

**What it reveals:**
- **Dark money paths:** A Super PAC that receives most of its funding from a single source, then spends on independent expenditures for a candidate
- **Bundling networks:** Multiple PACs controlled by the same organization routing money to the same candidates
- **Influence chains:** How industry money reaches legislators through layers of intermediary PACs

**Limitations:**
- FEC data only captures PAC-level transfers. Individual-to-PAC contributions are in separate bulk files.
- Attribution is proportional (if PAC A gets $100 from B and $100 from C, then gives $50 to a candidate, each source is attributed $25). This is an approximation — money is fungible.
- Maximum depth of 5 hops prevents exponential graph traversal.

---

## Q4: Why DuckDB over a traditional data warehouse?

**Answer:**

DuckDB serves a very specific role in this pipeline: in-memory analytical queries on FEC bulk files that are too large for Postgres but don't need a persistent warehouse.

**The use case:**
- FEC individual contribution files are ~4GB per election cycle
- We only need aggregated results (top employers, total by PAC)
- The raw data never goes into Postgres

**Why DuckDB fits:**
1. **Zero infrastructure:** Embedded engine, no server to manage. `import duckdb; duckdb.sql("SELECT ...")`
2. **Reads CSVs/Parquet directly:** `read_csv('file.csv', delim='|')` — no ETL step needed
3. **Columnar execution:** Grouped aggregations on 20M rows complete in seconds
4. **Constant memory:** Streams from disk, doesn't load the full file into memory
5. **SQL interface:** Familiar to anyone who knows Postgres

**Why not pandas?**
- pandas loads the entire file into memory (4GB+ → 8GB+ in memory with string overhead)
- Grouped aggregations on DataFrames are 10-100x slower than columnar execution
- DuckDB's SQL is more readable for complex aggregations than chained DataFrame operations

**Why not BigQuery/Snowflake?**
- The data fits on a single machine (4GB is small by warehouse standards)
- No need for distributed processing — DuckDB handles it in seconds
- Zero cost (no warehouse billing), zero latency (no network round-trips)
- Pipeline runs on GitHub Actions free tier — can't access external warehouses easily

**Why not load into Postgres?**
- 20M+ rows per cycle would double the database size
- Only aggregated results are needed downstream
- DuckDB query → aggregate → upsert to `derived.*` is cleaner

---

## Q5: How do you ensure data consistency across the 8 schemas?

**Answer:**

**FK constraints enforce referential integrity:**
```sql
-- Bills must reference existing legislators
sponsor_bioguide_id text REFERENCES congress.legislators(bioguide_id)

-- Vote positions must reference existing votes and legislators
vote_id text REFERENCES congress.bill_vote_summaries(id) ON DELETE CASCADE
bioguide_id text REFERENCES congress.legislators(bioguide_id) ON DELETE CASCADE
```

**Run order enforces FK dependencies:**
Legislators → Scores → Bills → Votes → FEC → Embeddings → Enrichment

If legislators fail to load, bill loading will fail on FK violations rather than creating orphaned records.

**Upsert ensures idempotency:**
Every write uses `INSERT ... ON CONFLICT DO UPDATE`. Re-running any step produces the same state. There's no "partial insert" risk — either a row is fully updated or the conflict is resolved.

**Watermarks prevent data loss:**
```python
watermark = get_watermark("sync_bills")      # Start from last success
# ... process data ...
log_run_end(run_id, watermark=now())          # Only on success
```

If a run fails, the watermark isn't updated. The next run re-processes from the same point.

**CASCADE deletes prevent orphans:**
```sql
ON DELETE CASCADE  -- On vote_positions, committee_memberships, etc.
```

If a legislator is removed (e.g., left office), their vote positions, committee memberships, and embeddings are automatically deleted.

**Cross-schema consistency is eventual, not transactional:**
The pipeline writes to schemas sequentially, not in a single transaction. Between steps, the database is in a partially-updated state. This is acceptable because:
- The API reads are tolerant of missing data (try/except around sub-queries)
- Pipeline runs during off-peak hours (6am/7am UTC)
- No user-facing writes depend on pipeline freshness

---

## Q6: How would you add a new data source (e.g., lobbying disclosures)?

**Answer:**

Following the established pattern:

**1. Schema:** Add tables to `pipeline/schema.sql`
```sql
CREATE SCHEMA IF NOT EXISTS lobbying;

CREATE TABLE lobbying.registrations (
    registration_id text PRIMARY KEY,
    registrant_name text NOT NULL,
    client_name     text NOT NULL,
    filing_date     date,
    ...
);
```

**2. Ingest:** Create `pipeline/ingest/lobbying.py`
- Fetch from the Senate Lobbying Disclosure Act database (bulk XML/JSON)
- Save raw files to `data/raw/lobbying/`

**3. Transform:** Create `pipeline/transform/lobbying.py`
- Parse raw data into the schema format
- Normalize names, dates, amounts

**4. Load:** Create `pipeline/load/lobbying.py`
- Use `shared.db.upsert()` for idempotent writes

**5. Link to legislators:** Add a FK or join table
```sql
-- If lobbyists register for specific legislators
CREATE TABLE lobbying.legislator_contacts (
    registration_id text REFERENCES lobbying.registrations(registration_id),
    bioguide_id     text REFERENCES congress.legislators(bioguide_id),
    ...
);
```

**6. API router:** Create `apps/api/app/routers/lobbying.py`
- Expose search and detail endpoints

**7. Pipeline integration:** Add to `scripts/sync_weekly.py` after FEC step

**8. Frontend:** Add a lobbying tab to the politician detail page, with a new TanStack Query hook.

The pattern is always: **Schema → Ingest → Transform → Load → API → Frontend**. Each layer has a clear template to follow from existing modules.

---

## Q7: What's the tsvector trigger doing, and why a trigger instead of application-level indexing?

**Answer:**

The trigger maintains the `search_vector` column on `congress.bills`:

```sql
CREATE OR REPLACE FUNCTION congress.bills_search_vector_update() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.summary, '')), 'B') ||
        setweight(to_tsvector('english',
            coalesce(NEW.sponsor_name, '') || ' ' ||
            coalesce(NEW.policy_area, '') || ' ' ||
            coalesce(array_to_string(NEW.topics, ' '), '')
        ), 'C') ||
        setweight(to_tsvector('english', coalesce(NEW.bill_number, '')), 'D');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**What it does:**
- Concatenates multiple text fields into a single tsvector
- Assigns weights: title (A, highest) > summary (B) > sponsor/topics (C) > bill number (D)
- `ts_rank_cd()` uses these weights when scoring search results

**Why a trigger instead of application code?**
1. **Consistency:** Every write path (pipeline upsert, manual SQL, API updates) automatically gets a correct search vector. No risk of forgetting to update it.
2. **Atomicity:** The vector update is part of the same transaction as the row write. No window where the row exists but the vector is stale.
3. **Performance:** Computed once on write (rare), read many times on search (frequent). The write overhead is negligible.

**Why not a generated column?** PostgreSQL generated columns can't reference multiple columns with different weights in a single tsvector expression. The trigger provides full flexibility for weighted concatenation.
