# Pipeline Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bill embeddings robust (per-bill error handling, re-embed on summary arrival, completeness validation), strip unused enrichment code/tables, extend money flow to include individual→PAC→candidate edges, and clean up pipeline architecture.

**Architecture:** Four sequential phases: (1) fix embedding robustness in `load/embeddings.py`, (2) delete dead enrichment code + API endpoints + schema tables, (3) extend `enrich/money_flow.py` to add individual→PAC edges from `derived.pac_top_funders`, (4) rename scripts, update sync orchestrators, update CLAUDE.md files.

**Tech Stack:** Python 3.11, psycopg2, sentence-transformers, NetworkX, PostgreSQL (Neon), FastAPI, SQLAlchemy 2.0

---

## File Structure

### Files to create
| File | Responsibility |
|------|---------------|
| `pipeline/scripts/enrich_donors.py` | Thin entry point: runs donor resolution only |
| `pipeline/scripts/enrich_money_flow.py` | Thin entry point: runs money flow (with individual→PAC edges) per cycle |

### Files to modify
| File | What changes |
|------|-------------|
| `pipeline/load/embeddings.py` | Per-bill error handling, has_summary tracking, re-embed pass, completeness report |
| `pipeline/enrich/money_flow.py` | Add `add_individual_edges()` to inject individual→PAC flows from pac_top_funders |
| `pipeline/schema.sql` | Drop unused tables, add `has_summary` column to bill_embeddings |
| `pipeline/scripts/sync_weekly.py` | Remove `sync_employer_enrichment` step |
| `apps/api/app/main.py` | Remove router registrations for ml, donor_similarity, research |
| `apps/api/app/db/models/enrichment.py` | Add `has_summary` column to BillEmbedding model |
| `apps/api/app/db/models/__init__.py` | No changes needed (already only imports BillEmbedding from enrichment) |
| `pipeline/CLAUDE.md` | Update commands, run order, key modules |

### Files to delete
| File | Reason |
|------|--------|
| `pipeline/enrich/employer_normalization.py` | Unused |
| `pipeline/enrich/address_standardization.py` | Unused |
| `pipeline/enrich/industry_classification.py` | Unused |
| `pipeline/enrich/industry_classifier.py` | Unused |
| `pipeline/enrich/industry_embeddings.py` | Unused |
| `pipeline/enrich/opensecrets.py` | Unused |
| `pipeline/enrich/stopwords.py` | Unused |
| `pipeline/enrich/donor_clustering.py` | Unused |
| `pipeline/enrich/suspicious_clusters.py` | Unused |
| `pipeline/enrich/change_detection.py` | Unused |
| `pipeline/enrich/vote_prediction.py` | Unused |
| `pipeline/scripts/enrich_tier1.py` | Replaced by enrich_donors.py |
| `pipeline/scripts/enrich_tier2.py` | Replaced by enrich_money_flow.py |
| `pipeline/scripts/enrich_tier3.py` | All Tier 3 stripped |
| `pipeline/scripts/populate_full.py` | Orchestrated stripped tiers |
| `pipeline/tests/test_address_standardization.py` | Tests deleted code |
| `pipeline/tests/test_change_detection.py` | Tests deleted code |
| `pipeline/tests/test_donor_clustering.py` | Tests deleted code |
| `pipeline/tests/test_employer_normalization.py` | Tests deleted code |
| `pipeline/tests/test_industry_classification.py` | Tests deleted code |
| `pipeline/tests/test_stopwords.py` | Tests deleted code |
| `pipeline/tests/test_suspicious_clusters.py` | Tests deleted code |
| `pipeline/tests/test_vote_prediction.py` | Tests deleted code |
| `apps/api/app/routers/donor_similarity.py` | No frontend usage |
| `apps/api/app/routers/research.py` | No frontend usage |
| `apps/api/app/routers/ml.py` | No frontend usage |

---

### Task 1: Make bill embeddings robust

**Files:**
- Modify: `pipeline/load/embeddings.py`
- Test: `pipeline/tests/test_load_embeddings.py` (create)

- [ ] **Step 1: Write tests for the new embedding logic**

Create `pipeline/tests/test_load_embeddings.py`:

```python
"""Tests for load/embeddings.py — robust bill embedding logic."""
import pytest
from unittest.mock import patch, MagicMock, call


class TestLoadBillEmbeddings:
    """Tests for load_bill_embeddings with robustness improvements."""

    @pytest.fixture
    def mock_db(self):
        with patch("load.embeddings.get_conn") as mock_get_conn:
            mock_conn = MagicMock()
            mock_cursor = MagicMock()
            mock_conn.cursor.return_value = mock_cursor
            mock_get_conn.return_value = mock_conn
            yield {"conn": mock_conn, "cursor": mock_cursor}

    @pytest.fixture
    def mock_model(self):
        with patch("load.embeddings.get_model") as mock_gm:
            model = MagicMock()
            mock_gm.return_value = model
            yield model

    @pytest.fixture
    def mock_embed(self):
        with patch("load.embeddings.embed_texts") as mock_et:
            yield mock_et

    @pytest.fixture
    def mock_upsert(self):
        with patch("load.embeddings.upsert") as mock_u:
            mock_u.return_value = 0
            yield mock_u

    def test_skips_empty_text_bills(self, mock_db, mock_model, mock_embed, mock_upsert):
        """Bills with no title AND no summary should be skipped entirely."""
        # No existing embeddings
        mock_db["cursor"].fetchall.side_effect = [
            [],  # existing embeddings query
            [("bill-1", None, None), ("bill-2", "Clean Energy Act", None)],  # all bills
        ]
        mock_embed.return_value = [[0.1] * 384]

        from load.embeddings import load_bill_embeddings
        result = load_bill_embeddings(batch_size=500)

        # Only bill-2 should be embedded (bill-1 has no title or summary)
        mock_embed.assert_called_once()
        texts_arg = mock_embed.call_args[0][1]
        assert len(texts_arg) == 1
        assert "Clean Energy Act" in texts_arg[0]

    def test_reembeds_when_summary_arrives(self, mock_db, mock_model, mock_embed, mock_upsert):
        """Bills embedded without summary should be re-embedded when summary becomes available."""
        # bill-1 already embedded without summary
        mock_db["cursor"].fetchall.side_effect = [
            [("bill-1",)],  # existing embeddings
            [("bill-1", "Clean Energy Act", "A bill to promote clean energy")],  # all bills
            [("bill-1",)],  # stale embeddings (has_summary=false but summary now exists)
        ]
        mock_embed.return_value = [[0.1] * 384]

        from load.embeddings import load_bill_embeddings
        result = load_bill_embeddings(batch_size=500)

        # Should re-embed bill-1 because summary arrived
        assert mock_embed.called

    def test_per_bill_error_handling(self, mock_db, mock_model, mock_embed, mock_upsert):
        """A single bill failing to encode should not crash the entire batch."""
        mock_db["cursor"].fetchall.side_effect = [
            [],  # existing embeddings
            [("bill-1", "Good Bill", None), ("bill-2", "Another Bill", None)],  # all bills
            [],  # stale embeddings
        ]
        # First call raises, second succeeds
        mock_embed.side_effect = [Exception("encoding failed"), [[0.1] * 384]]

        from load.embeddings import load_bill_embeddings
        # Should not raise — skips failed bills
        result = load_bill_embeddings(batch_size=1)
        # At least one bill should have been embedded
        assert mock_upsert.called

    def test_completeness_report_logged(self, mock_db, mock_model, mock_embed, mock_upsert):
        """Should log coverage percentage after embedding."""
        mock_db["cursor"].fetchall.side_effect = [
            [],  # existing embeddings
            [("bill-1", "Bill Title", "Summary")],  # all bills
            [],  # stale embeddings
        ]
        mock_db["cursor"].fetchone.side_effect = [
            (1,),  # embedded count
            (1,),  # total embeddable count
        ]
        mock_embed.return_value = [[0.1] * 384]

        from load.embeddings import load_bill_embeddings
        # Should complete without error — coverage logging happens internally
        load_bill_embeddings(batch_size=500)
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd pipeline && uv run pytest tests/test_load_embeddings.py -v
```

Expected: FAIL — `test_load_embeddings.py` does not exist yet (creating it is part of this step), and the load_bill_embeddings function doesn't support the new behavior.

- [ ] **Step 3: Rewrite `load/embeddings.py` with robustness improvements**

Replace `pipeline/load/embeddings.py` with:

```python
"""Generate bill embeddings and upload to enrichment.bill_embeddings."""
import structlog
from shared.db import get_conn, upsert
from shared.embeddings import get_model, embed_texts

log = structlog.get_logger()
MODEL_VERSION = "all-MiniLM-L6-v2-v1"


def load_bill_embeddings(batch_size: int = 500) -> int:
    conn = get_conn()
    cur = conn.cursor()
    model = get_model()

    # 1. Get existing embeddings
    cur.execute("SELECT bill_id FROM enrichment.bill_embeddings WHERE model_version = %s", (MODEL_VERSION,))
    existing = {r[0] for r in cur.fetchall()}
    log.info("existing_embeddings", count=len(existing))

    # 2. Get all bills
    cur.execute("SELECT bill_id, title, summary FROM congress.bills")
    all_bills = cur.fetchall()

    # 3. Find new bills to embed (skip empty-text bills)
    new_bills = []
    skipped_empty = 0
    for b in all_bills:
        bill_id, title, summary = b
        if bill_id in existing:
            continue
        text = f"{title or ''} {summary or ''}".strip()
        if not text:
            skipped_empty += 1
            continue
        new_bills.append(b)

    log.info("new_bills_to_embed", count=len(new_bills), skipped_empty=skipped_empty)

    # 4. Find stale embeddings (embedded without summary, but summary now available)
    cur.execute("""
        SELECT be.bill_id FROM enrichment.bill_embeddings be
        JOIN congress.bills b ON b.bill_id = be.bill_id
        WHERE be.model_version = %s AND be.has_summary = false AND b.summary IS NOT NULL
    """, (MODEL_VERSION,))
    stale_bills_ids = {r[0] for r in cur.fetchall()}

    stale_bills = []
    if stale_bills_ids:
        stale_bills = [b for b in all_bills if b[0] in stale_bills_ids]
        log.info("stale_embeddings_to_refresh", count=len(stale_bills))

    # 5. Combine new + stale
    to_embed = new_bills + stale_bills
    total = 0
    failed_ids: list[str] = []

    # 6. Process in batches with per-bill error handling
    for i in range(0, len(to_embed), batch_size):
        chunk = to_embed[i : i + batch_size]
        batch_num = i // batch_size + 1
        log.info("embedding_batch_start", batch=batch_num,
                 first_bill=chunk[0][0], last_bill=chunk[-1][0], size=len(chunk))

        texts = []
        valid_bills = []
        for b in chunk:
            text = f"{b[1] or ''} {b[2] or ''}".strip()
            if not text:
                continue
            texts.append(text)
            valid_bills.append(b)

        if not texts:
            continue

        try:
            embeddings = embed_texts(model, texts)
        except Exception as e:
            log.error("batch_encoding_failed", batch=batch_num, error=str(e),
                      bill_ids=[b[0] for b in valid_bills])
            failed_ids.extend(b[0] for b in valid_bills)
            continue

        rows = []
        for b, emb in zip(valid_bills, embeddings):
            has_summary = b[2] is not None and b[2].strip() != ""
            rows.append({
                "bill_id": b[0],
                "embedding": emb,
                "model_version": MODEL_VERSION,
                "has_summary": has_summary,
            })

        upsert("bill_embeddings", rows, on_conflict="bill_id", schema="enrichment")
        total += len(rows)
        log.info("embedded_batch", batch=batch_num, count=len(rows), total=total)

    # 7. Completeness report
    cur.execute("SELECT COUNT(*) FROM enrichment.bill_embeddings WHERE model_version = %s", (MODEL_VERSION,))
    embedded_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM congress.bills WHERE title IS NOT NULL")
    embeddable_count = cur.fetchone()[0]
    coverage = (embedded_count / embeddable_count * 100) if embeddable_count > 0 else 0

    if failed_ids:
        log.warning("embedding_failures", failed_count=len(failed_ids), failed_ids=failed_ids[:20])

    if coverage < 95:
        log.warning("low_embedding_coverage", coverage_pct=round(coverage, 1),
                    embedded=embedded_count, embeddable=embeddable_count)
    else:
        log.info("embedding_coverage", coverage_pct=round(coverage, 1),
                 embedded=embedded_count, embeddable=embeddable_count)

    log.info("bill_embeddings_complete", total_embedded=total, failed=len(failed_ids),
             coverage_pct=round(coverage, 1))
    return total
```

- [ ] **Step 4: Add `has_summary` column to schema.sql**

In `pipeline/schema.sql`, update the `enrichment.bill_embeddings` table definition (around line 301):

```sql
CREATE TABLE enrichment.bill_embeddings (
    bill_id         text PRIMARY KEY REFERENCES congress.bills(bill_id) ON DELETE CASCADE,
    embedding       vector(384) NOT NULL,
    model_version   text NOT NULL,
    has_summary     boolean NOT NULL DEFAULT false,
    created_at      timestamptz DEFAULT now()
);
```

- [ ] **Step 5: Add `has_summary` to the SQLAlchemy model**

In `apps/api/app/db/models/enrichment.py`, add:

```python
from sqlalchemy import Boolean
```

And add this column to the `BillEmbedding` class:

```python
    has_summary: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=False)
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd pipeline && uv run pytest tests/test_load_embeddings.py -v
```

Expected: All tests PASS.

- [ ] **Step 7: Run full pipeline test suite**

```bash
cd pipeline && uv run pytest -v
```

Expected: All existing tests still pass. Some tests for deleted code will fail — that's expected and handled in Task 2.

- [ ] **Step 8: Commit**

```bash
cd pipeline && git add load/embeddings.py tests/test_load_embeddings.py schema.sql ../apps/api/app/db/models/enrichment.py
git commit -m "feat(pipeline): robust bill embeddings — per-bill error handling, summary re-embed, coverage validation"
```

---

### Task 2: Delete dead enrichment code and tests

**Files:**
- Delete: 11 enrich modules, 4 scripts, 8 test files (see file list above)

- [ ] **Step 1: Delete dead pipeline enrichment modules**

```bash
cd pipeline
rm enrich/employer_normalization.py
rm enrich/address_standardization.py
rm enrich/industry_classification.py
rm enrich/industry_classifier.py
rm enrich/industry_embeddings.py
rm enrich/opensecrets.py
rm enrich/stopwords.py
rm enrich/donor_clustering.py
rm enrich/suspicious_clusters.py
rm enrich/change_detection.py
rm enrich/vote_prediction.py
```

- [ ] **Step 2: Delete dead pipeline scripts**

```bash
cd pipeline
rm scripts/enrich_tier1.py
rm scripts/enrich_tier2.py
rm scripts/enrich_tier3.py
rm scripts/populate_full.py
```

- [ ] **Step 3: Delete tests for deleted code**

```bash
cd pipeline
rm tests/test_address_standardization.py
rm tests/test_change_detection.py
rm tests/test_donor_clustering.py
rm tests/test_employer_normalization.py
rm tests/test_industry_classification.py
rm tests/test_stopwords.py
rm tests/test_suspicious_clusters.py
rm tests/test_vote_prediction.py
```

- [ ] **Step 4: Run remaining tests to verify nothing breaks**

```bash
cd pipeline && uv run pytest -v
```

Expected: All remaining tests PASS. The deleted modules are not imported by anything we're keeping (verified: `donor_resolution.py` and `money_flow.py` have no imports from deleted modules).

- [ ] **Step 5: Commit**

```bash
cd pipeline && git add -A
git commit -m "chore(pipeline): remove unused enrichment tiers — employer norm, address std, industry, clustering, anomalies"
```

---

### Task 3: Delete dead API endpoints

**Files:**
- Delete: `apps/api/app/routers/donor_similarity.py`, `apps/api/app/routers/research.py`, `apps/api/app/routers/ml.py`
- Modify: `apps/api/app/main.py`

- [ ] **Step 1: Delete the three unused router files**

```bash
rm apps/api/app/routers/donor_similarity.py
rm apps/api/app/routers/research.py
rm apps/api/app/routers/ml.py
```

- [ ] **Step 2: Remove router registrations from `apps/api/app/main.py`**

Remove these 6 lines from `apps/api/app/main.py` (lines 100-110):

```python
from app.routers import ml
app.include_router(ml.router)

from app.routers import donor_similarity
app.include_router(donor_similarity.router)

from app.routers import research
app.include_router(research.router)
```

The file should end with:

```python
from app.routers import representatives
app.include_router(representatives.router)

from app.routers import money_flow
app.include_router(money_flow.router)
```

- [ ] **Step 3: Run API tests**

```bash
cd apps/api && uv run pytest -v
```

Expected: Tests pass. If any tests reference deleted routers, delete those test files too.

- [ ] **Step 4: Commit**

```bash
git add apps/api/app/routers/ apps/api/app/main.py
git commit -m "chore(api): remove unused endpoints — donor_similarity, research, ml"
```

---

### Task 4: Drop unused tables from schema.sql

**Files:**
- Modify: `pipeline/schema.sql`

- [ ] **Step 1: Remove the `anomalies` schema creation and all anomalies tables**

Remove the `CREATE SCHEMA IF NOT EXISTS anomalies;` line from the header (line 13).

Remove the entire anomalies section (lines 401-454):

```sql
-- ============================================================
-- anomalies.* — Flagged patterns (Tier 3)
-- ============================================================

CREATE TABLE anomalies.suspicious_contribution_events ( ... );
CREATE INDEX ON anomalies.suspicious_contribution_events (committee_id);
CREATE INDEX ON anomalies.suspicious_contribution_events (score);

CREATE TABLE anomalies.committee_change_points ( ... );
CREATE INDEX ON anomalies.committee_change_points (committee_id);

CREATE TABLE anomalies.geographic_anomalies ( ... );

CREATE TABLE anomalies.amount_distribution_anomalies ( ... );
```

- [ ] **Step 2: Remove unused enrichment tables from schema.sql**

Remove these tables and their indexes (lines 257-299):

```sql
CREATE TABLE enrichment.employer_canonical ( ... );
CREATE INDEX ON enrichment.employer_canonical (canonical_employer_id);
CREATE INDEX ON enrichment.employer_canonical (raw_string);

CREATE TABLE enrichment.employer_industry ( ... );
CREATE INDEX ON enrichment.employer_industry (canonical_employer_id);
CREATE INDEX ON enrichment.employer_industry (industry);

CREATE TABLE enrichment.donor_address_normalized ( ... );
CREATE INDEX ON enrichment.donor_address_normalized (zip5);
CREATE INDEX ON enrichment.donor_address_normalized (state);
```

Keep `enrichment.donor_canonical` and `enrichment.bill_embeddings`.

- [ ] **Step 3: Remove unused analytics tables from schema.sql**

Remove these tables and their indexes (lines 316-399):

```sql
CREATE TABLE analytics.donor_cluster ( ... );
CREATE INDEX ON analytics.donor_cluster (canonical_donor_id);
CREATE INDEX ON analytics.donor_cluster (cluster_id);

CREATE TABLE analytics.entity_community ( ... );
CREATE INDEX ON analytics.entity_community (entity_id, entity_type);
CREATE INDEX ON analytics.entity_community (community_id);

CREATE TABLE analytics.entity_centrality ( ... );
CREATE INDEX ON analytics.entity_centrality (entity_id, entity_type);

CREATE TABLE analytics.bundling_events ( ... );
CREATE INDEX ON analytics.bundling_events (committee_id);

CREATE TABLE analytics.donor_feature_vectors ( ... );
CREATE INDEX ON analytics.donor_feature_vectors USING hnsw ...;
```

Keep `analytics.money_flow_attribution`.

- [ ] **Step 4: Update the schema header comment**

Change the header from "8 Postgres schemas" to "7 Postgres schemas" (anomalies removed).

Update the enrichment section comment:

```sql
-- ============================================================
-- enrichment.* — ML-produced clean data
-- ============================================================
```

Update the analytics section comment:

```sql
-- ============================================================
-- analytics.* — Money flow attribution
-- ============================================================
```

- [ ] **Step 5: Commit**

```bash
git add pipeline/schema.sql
git commit -m "chore(schema): drop unused tables — employer, address, industry, clustering, anomalies"
```

---

### Task 5: Extend money flow with individual→PAC edges

**Files:**
- Modify: `pipeline/enrich/money_flow.py`
- Test: `pipeline/tests/test_money_flow.py`

- [ ] **Step 1: Write test for individual→PAC edge injection**

Add to `pipeline/tests/test_money_flow.py`:

```python
from enrich.money_flow import add_individual_edges


def test_add_individual_edges():
    """Individual donors from pac_top_funders should become inbound flow rows."""
    top_funders = [
        {"cmte_id": "C002", "canonical_donor_id": "d_12345", "display_name": "Jane Smith",
         "total_amount": 50000, "cycle": 2024},
        {"cmte_id": "C002", "canonical_donor_id": "d_67890", "display_name": "John Doe",
         "total_amount": 25000, "cycle": 2024},
    ]
    flows = add_individual_edges(top_funders, cycle=2024)
    assert len(flows) == 2
    assert all(f["origin_entity_type"] == "individual" for f in flows)
    assert all(f["destination_committee_id"] == "C002" for f in flows)
    assert all(f["hop_count"] == 1 for f in flows)
    assert all(f["cycle"] == 2024 for f in flows)
    # First funder
    jane = [f for f in flows if f["origin_entity_id"] == "d_12345"][0]
    assert jane["attributed_amount"] == 50000
    assert jane["path"] == ["d_12345", "C002"]


def test_add_individual_edges_empty():
    """Empty top_funders list produces no flows."""
    flows = add_individual_edges([], cycle=2024)
    assert flows == []
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
cd pipeline && uv run pytest tests/test_money_flow.py::test_add_individual_edges -v
```

Expected: FAIL — `add_individual_edges` doesn't exist yet.

- [ ] **Step 3: Implement `add_individual_edges` in `enrich/money_flow.py`**

Add this function to `pipeline/enrich/money_flow.py` after the `extract_pac_transfers` function:

```python
def add_individual_edges(top_funders: list[dict], cycle: int) -> list[dict]:
    """Create individual→PAC flow rows from pac_top_funders data.

    Each top funder becomes a 1-hop inbound flow to their PAC.
    """
    flows = []
    for funder in top_funders:
        flows.append({
            "destination_committee_id": funder["cmte_id"],
            "origin_entity_id": funder["canonical_donor_id"],
            "origin_entity_type": "individual",
            "attributed_amount": float(funder["total_amount"]),
            "hop_count": 1,
            "path": [funder["canonical_donor_id"], funder["cmte_id"]],
            "cycle": cycle,
            "model_version": MODEL_VERSION,
        })
    return flows
```

- [ ] **Step 4: Update `run_money_flow` to fetch and inject individual edges**

Modify the `run_money_flow` function in `pipeline/enrich/money_flow.py`. After the existing PAC flow tracing, add individual edges:

```python
def run_money_flow(parquet_path: Path, cycle: int, max_depth: int = 3) -> int:
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("DELETE FROM analytics.money_flow_attribution WHERE cycle = %s", (cycle,))

    transfers = extract_pac_transfers(parquet_path)
    if not transfers:
        log.warning("no_pac_transfers_found")
        return 0
    graph = build_pac_graph(transfers)
    log.info("pac_graph_built", nodes=len(graph.nodes), edges=len(graph.edges))

    top_nodes = sorted(graph.nodes, key=lambda n: sum(graph[pred][n]["weight"] for pred in graph.predecessors(n)), reverse=True)[:500]

    all_flows = []
    for node in top_nodes:
        flows = trace_money_flow(graph, node, direction="inbound", max_depth=max_depth)
        for flow in flows:
            flow["cycle"] = cycle
        all_flows.extend(flows)

    # Add individual→PAC edges from pac_top_funders
    cur.execute("""
        SELECT cmte_id, canonical_donor_id, display_name, total_amount
        FROM derived.pac_top_funders
        WHERE cycle = %s
    """, (cycle,))
    top_funders = [dict(row) for row in cur.fetchall()]
    individual_flows = add_individual_edges(top_funders, cycle=cycle)
    all_flows.extend(individual_flows)
    log.info("individual_edges_added", count=len(individual_flows))

    if all_flows:
        upsert("money_flow_attribution", all_flows, schema="analytics")

    log.info("money_flow_complete", flows=len(all_flows), committees_traced=len(top_nodes),
             individual_edges=len(individual_flows))
    return len(all_flows)
```

- [ ] **Step 5: Run money flow tests**

```bash
cd pipeline && uv run pytest tests/test_money_flow.py -v
```

Expected: All tests PASS (both old and new).

- [ ] **Step 6: Commit**

```bash
cd pipeline && git add enrich/money_flow.py tests/test_money_flow.py
git commit -m "feat(pipeline): extend money flow with individual→PAC edges from pac_top_funders"
```

---

### Task 6: Create new entry point scripts

**Files:**
- Create: `pipeline/scripts/enrich_donors.py`
- Create: `pipeline/scripts/enrich_money_flow.py`

- [ ] **Step 1: Create `scripts/enrich_donors.py`**

```python
"""Run donor entity resolution.

Usage: cd pipeline && uv run python -m scripts.enrich_donors [--cycles 2024,2026]
"""
import argparse
import sys
from pathlib import Path

import structlog

from shared.observability import configure_logging, configure_sentry
from shared.db import log_run_start, log_run_end
from enrich.donor_resolution import run_donor_resolution

SCRIPT = "enrich_donors"
DATA_DIR = Path(__file__).parent.parent / "data"
log = structlog.get_logger()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cycles", type=str, default="2024,2026")
    args = parser.parse_args()
    cycles = [int(c) for c in args.cycles.split(",")]

    configure_logging(service="pipeline")
    configure_sentry(service="pipeline")

    run_id = log_run_start(SCRIPT)

    try:
        indiv_parquets = []
        for cycle in cycles:
            path = DATA_DIR / "fec" / str(cycle) / "indiv.parquet"
            if path.exists():
                indiv_parquets.append(path)
            else:
                log.warning("indiv_parquet_missing", cycle=cycle, path=str(path))

        if not indiv_parquets:
            log.warning("no_parquets_found")
            log_run_end(run_id, "success", rows_processed=0)
            return

        total = run_donor_resolution(indiv_parquets)
        log_run_end(run_id, "success", rows_processed=total)
        log.info("enrich_donors_complete", total=total)

    except Exception as e:
        log.error("enrich_donors_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Create `scripts/enrich_money_flow.py`**

```python
"""Run money flow tracing (PAC chains + individual→PAC edges).

Usage: cd pipeline && uv run python -m scripts.enrich_money_flow [--cycles 2024,2026]
"""
import argparse
import sys
from pathlib import Path

import structlog

from shared.observability import configure_logging, configure_sentry
from shared.db import log_run_start, log_run_end
from enrich.money_flow import run_money_flow

SCRIPT = "enrich_money_flow"
DATA_DIR = Path(__file__).parent.parent / "data"
log = structlog.get_logger()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cycles", type=str, default="2024,2026")
    args = parser.parse_args()
    cycles = [int(c) for c in args.cycles.split(",")]

    configure_logging(service="pipeline")
    configure_sentry(service="pipeline")

    run_id = log_run_start(SCRIPT)
    total = 0

    try:
        for cycle in cycles:
            pas2_parquet = DATA_DIR / "fec" / str(cycle) / "pas2.parquet"
            if pas2_parquet.exists():
                log.info("money_flow_starting", cycle=cycle)
                total += run_money_flow(pas2_parquet, cycle)
            else:
                log.warning("pas2_parquet_missing", cycle=cycle, path=str(pas2_parquet))

        log_run_end(run_id, "success", rows_processed=total)
        log.info("enrich_money_flow_complete", total=total)

    except Exception as e:
        log.error("enrich_money_flow_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Commit**

```bash
cd pipeline && git add scripts/enrich_donors.py scripts/enrich_money_flow.py
git commit -m "feat(pipeline): add enrich_donors and enrich_money_flow entry scripts"
```

---

### Task 7: Update sync_weekly.py

**Files:**
- Modify: `pipeline/scripts/sync_weekly.py`

- [ ] **Step 1: Remove the `sync_employer_enrichment` step**

In `pipeline/scripts/sync_weekly.py`, delete the `sync_employer_enrichment` function (lines 168-173):

```python
def sync_employer_enrichment():
    """Re-run employer normalization + industry classification on any new employers."""
    from enrich.opensecrets import run_industry_classification_opensecrets
    count = run_industry_classification_opensecrets(DATA_DIR)
    log.info("industry_reclassified", count=count)
    return count
```

And remove it from the `steps` list (line 186):

```python
        ("employer_enrichment", sync_employer_enrichment),
```

The `steps` list should be:

```python
    steps = [
        ("legislators", sync_legislators),
        ("voteview", sync_voteview),
        ("fec_api", sync_fec_api),
        ("funding_summaries", sync_funding_summaries),
    ]
```

- [ ] **Step 2: Run pipeline tests**

```bash
cd pipeline && uv run pytest -v
```

Expected: All remaining tests PASS.

- [ ] **Step 3: Commit**

```bash
cd pipeline && git add scripts/sync_weekly.py
git commit -m "chore(pipeline): remove employer enrichment from weekly sync"
```

---

### Task 8: Update GitHub Actions workflow names

**Files:**
- Modify: `.github/workflows/sync-weekly.yml`

- [ ] **Step 1: Update workflow name to reflect stripped enrichment**

In `.github/workflows/sync-weekly.yml`, update the name (line 1):

```yaml
name: Weekly Sync — FEC API + Legislators + VoteView
```

(Remove "+ Enrichment" since employer enrichment is gone.)

No other changes needed — the workflows call `scripts.sync_daily` and `scripts.sync_weekly` which are updated.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/sync-weekly.yml
git commit -m "chore(ci): update weekly workflow name"
```

---

### Task 9: Update pipeline CLAUDE.md

**Files:**
- Modify: `pipeline/CLAUDE.md`

- [ ] **Step 1: Update the commands table**

Replace the commands table with:

```markdown
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
```

- [ ] **Step 2: Update the Architecture section**

Replace the Enrich bullet with:

```markdown
- **Enrich** (`enrich/`): donor entity resolution (`donor_resolution.py`) + money flow tracing (`money_flow.py`)
```

- [ ] **Step 3: Update the Run Order table**

Replace with:

```markdown
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
```

- [ ] **Step 4: Update Key Modules section**

Replace the enrich bullet with:

```markdown
- **`enrich/`** — donor resolution (`donor_resolution.py`), money flow tracing (`money_flow.py`)
```

- [ ] **Step 5: Update "What Claude Should Never Do" section**

Remove the line:
```
- Treat derived/enrichment tables as source tables — always computed
```

And update to remove references to old tier scripts. The section should be:

```markdown
## What Claude Should Never Do

- Load full FEC indiv file into memory (will OOM)
- Load `individual_contributions`, `candidates`, or `fec_committees` to the database — local-only
- Skip the run order (FK constraints will fail)
- Hardcode credentials or API keys
```

- [ ] **Step 6: Commit**

```bash
git add pipeline/CLAUDE.md
git commit -m "docs(pipeline): update CLAUDE.md — remove tier references, new run order"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full pipeline test suite**

```bash
cd pipeline && uv run pytest -v
```

Expected: All tests PASS.

- [ ] **Step 2: Run API test suite**

```bash
cd apps/api && uv run pytest -v
```

Expected: All tests PASS.

- [ ] **Step 3: Type check frontend**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No type errors (frontend unchanged).

- [ ] **Step 4: Verify no dangling imports**

```bash
cd pipeline && grep -r "from enrich.employer" --include="*.py" .
cd pipeline && grep -r "from enrich.address" --include="*.py" .
cd pipeline && grep -r "from enrich.industry" --include="*.py" .
cd pipeline && grep -r "from enrich.donor_clustering" --include="*.py" .
cd pipeline && grep -r "from enrich.suspicious" --include="*.py" .
cd pipeline && grep -r "from enrich.change_detection" --include="*.py" .
cd pipeline && grep -r "from enrich.vote_prediction" --include="*.py" .
cd pipeline && grep -r "from enrich.opensecrets" --include="*.py" .
cd pipeline && grep -r "from enrich.stopwords" --include="*.py" .
```

Expected: No output for any of these — all imports to deleted modules are gone.

- [ ] **Step 5: Commit any fixes if needed, then tag**

If any tests failed or imports were dangling, fix and commit. Otherwise, no action needed.
