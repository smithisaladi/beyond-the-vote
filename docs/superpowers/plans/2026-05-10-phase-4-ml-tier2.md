# Phase 4: ML Tier 2 — Donor Clustering + Money Flow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build donor behavioral clustering (UMAP + HDBSCAN) and money flow tracing (PAC chain graph traversal), then expose them as FastAPI endpoints for donor similarity search and follow-the-money queries.

**Architecture:** Pipeline enrichment runs locally: builds donor feature vectors from Parquet, reduces with UMAP, clusters with HDBSCAN, stores vectors in pgvector for similarity search. Money flow traces PAC-to-PAC chains in DuckDB and materializes weighted attribution paths. FastAPI serves donor similarity via HNSW nearest-neighbor and money flow via materialized table + optional networkx fallback.

**Tech Stack:** UMAP, HDBSCAN, scikit-learn, pgvector, networkx, DuckDB, sentence-transformers

**Design spec:** `docs/superpowers/specs/2026-05-10-full-stack-refactor-design.md` (Tier 2 + ML-powered features)

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `pipeline/enrich/donor_clustering.py` | Tier 2a: feature vectors + UMAP + HDBSCAN |
| Create | `pipeline/enrich/money_flow.py` | Tier 2d: PAC chain traversal + attribution |
| Create | `pipeline/scripts/enrich_tier2.py` | Tier 2 orchestrator |
| Create | `pipeline/tests/test_donor_clustering.py` | Clustering tests |
| Create | `pipeline/tests/test_money_flow.py` | Money flow tests |
| Create | `apps/api/app/routers/donor_similarity.py` | Donor similarity endpoint |
| Create | `apps/api/app/routers/money_flow.py` | Follow-the-money endpoint |
| Modify | `apps/api/app/main.py` | Wire new routers |

---

## Task 1: Donor feature vector computation + clustering

**Files:**
- Create: `pipeline/enrich/donor_clustering.py`
- Create: `pipeline/tests/test_donor_clustering.py`

- [ ] **Step 1: Write tests**

```python
# pipeline/tests/test_donor_clustering.py
from pipeline.enrich.donor_clustering import (
    build_donor_features,
    cluster_donors,
    compute_feature_vectors,
)
import numpy as np


def test_build_donor_features():
    """Build feature vector from aggregated donor data."""
    donor = {
        "canonical_id": "d_1001",
        "total_amount": 5000.0,
        "contribution_count": 10,
        "party_d_pct": 0.7,
        "party_r_pct": 0.3,
        "candidate_pct": 0.6,
        "pac_pct": 0.4,
        "state_count": 3,
    }
    features = build_donor_features(donor)
    assert len(features) == 7
    assert features[0] == 5000.0  # total_amount
    assert features[1] == 10      # count
    assert features[2] == 0.7     # party_d


def test_build_donor_features_missing_values():
    donor = {"canonical_id": "d_1001"}
    features = build_donor_features(donor)
    assert len(features) == 7
    assert all(f == 0.0 for f in features)


def test_cluster_donors_returns_labels():
    """Clustering with mock feature matrix."""
    features = np.array([
        [1000, 5, 0.8, 0.2, 0.5, 0.5, 1],
        [1100, 6, 0.9, 0.1, 0.6, 0.4, 1],
        [50000, 2, 0.1, 0.9, 0.9, 0.1, 5],
        [55000, 3, 0.0, 1.0, 1.0, 0.0, 4],
    ])
    labels, reduced = cluster_donors(features, min_cluster_size=2)
    assert len(labels) == 4
    # Similar donors should share a cluster
    assert labels[0] == labels[1]
    assert labels[2] == labels[3]


def test_compute_feature_vectors_with_synthetic_data(tmp_path):
    """End-to-end: compute features from a parquet file."""
    import duckdb
    parquet_path = tmp_path / "test_indiv.parquet"
    conn = duckdb.connect(":memory:")
    conn.execute("""
        CREATE TABLE donors AS
        SELECT 'C00001' as cmte_id, '' as amndt_ind, '' as rpt_tp, '' as transaction_pgi,
               '' as image_num, '15' as transaction_tp, 'IND' as entity_tp,
               'SMITH, JOHN' as name, 'NY' as city, 'NY' as state, '10001' as zip_code,
               'ACME' as employer, 'CEO' as occupation, '01012025' as transaction_dt,
               '500' as transaction_amt, '' as other_id, '' as tran_id, '' as file_num,
               '' as memo_cd, '' as memo_text, '1001' as sub_id
        UNION ALL
        SELECT 'C00002', '', '', '', '', '15', 'IND', 'SMITH, JOHN', 'NY', 'NY', '10001',
               'ACME', 'CEO', '02012025', '300', '', '', '', '', '', '1002'
    """)
    conn.execute(f"COPY donors TO '{parquet_path}' (FORMAT PARQUET)")
    conn.close()

    # Need canonical donor mapping
    canonical_map = {"1001": "d_1001", "1002": "d_1001"}
    result = compute_feature_vectors(parquet_path, canonical_map)
    assert len(result) >= 1
    assert "canonical_id" in result[0]
    assert "features" in result[0]
```

- [ ] **Step 2: Implement donor clustering**

```python
# pipeline/enrich/donor_clustering.py
"""Tier 2a: Donor behavioral clustering via UMAP + HDBSCAN."""
from collections import defaultdict
from pathlib import Path

import numpy as np
import structlog

from pipeline.shared.db import upsert, get_supabase
from pipeline.shared.parquet import duckdb_connect

log = structlog.get_logger()

MODEL_VERSION = "donor_cluster_v1_umap_hdbscan"


def build_donor_features(donor: dict) -> list[float]:
    """Build a 7-dim feature vector from aggregated donor giving data.

    Features: total_amount, contribution_count, party_d_pct, party_r_pct,
    candidate_pct, pac_pct, geographic_spread (state_count).
    """
    return [
        float(donor.get("total_amount") or 0),
        float(donor.get("contribution_count") or 0),
        float(donor.get("party_d_pct") or 0),
        float(donor.get("party_r_pct") or 0),
        float(donor.get("candidate_pct") or 0),
        float(donor.get("pac_pct") or 0),
        float(donor.get("state_count") or 0),
    ]


def compute_feature_vectors(
    parquet_path: Path,
    canonical_map: dict[str, str],
) -> list[dict]:
    """Compute per-canonical-donor feature vectors from raw contributions.

    Args:
        parquet_path: Path to indiv.parquet
        canonical_map: {sub_id_str: canonical_donor_id}

    Returns: list of {canonical_id, features: list[float]}
    """
    with duckdb_connect() as conn:
        df = conn.execute(f"""
            SELECT CAST(sub_id AS VARCHAR) as sub_id,
                   transaction_amt,
                   cmte_id,
                   state
            FROM read_parquet('{parquet_path}')
            WHERE entity_tp = 'IND' OR entity_tp = '' OR entity_tp IS NULL
        """).fetchdf()

    # Aggregate by canonical donor
    agg: dict[str, dict] = defaultdict(lambda: {
        "total_amount": 0.0, "contribution_count": 0,
        "cmte_ids": set(), "states": set(),
    })

    for _, row in df.iterrows():
        sub_id = str(row.get("sub_id") or "")
        canonical_id = canonical_map.get(sub_id)
        if not canonical_id:
            continue
        amt = float(row.get("transaction_amt") or 0)
        agg[canonical_id]["total_amount"] += amt
        agg[canonical_id]["contribution_count"] += 1
        cmte = str(row.get("cmte_id") or "")
        if cmte:
            agg[canonical_id]["cmte_ids"].add(cmte)
        state = str(row.get("state") or "")
        if state:
            agg[canonical_id]["states"].add(state)

    results = []
    for canonical_id, data in agg.items():
        donor = {
            "canonical_id": canonical_id,
            "total_amount": data["total_amount"],
            "contribution_count": data["contribution_count"],
            "party_d_pct": 0.0,  # Would need party lookup — simplified for v1
            "party_r_pct": 0.0,
            "candidate_pct": 0.5,
            "pac_pct": 0.5,
            "state_count": len(data["states"]),
        }
        features = build_donor_features(donor)
        results.append({"canonical_id": canonical_id, "features": features})

    log.info("feature_vectors_computed", donors=len(results))
    return results


def cluster_donors(
    features: np.ndarray,
    min_cluster_size: int = 5,
    n_components: int = 10,
) -> tuple[np.ndarray, np.ndarray]:
    """Reduce dimensions with UMAP and cluster with HDBSCAN.

    Returns: (labels, reduced_embeddings)
    """
    import umap
    import hdbscan

    # Cap n_components to feature dimensions
    n_comp = min(n_components, features.shape[1], features.shape[0] - 1)
    if n_comp < 2:
        n_comp = 2

    # Normalize features
    from sklearn.preprocessing import StandardScaler
    scaler = StandardScaler()
    scaled = scaler.fit_transform(features)

    # UMAP reduction
    reducer = umap.UMAP(n_components=n_comp, metric="euclidean", random_state=42)
    reduced = reducer.fit_transform(scaled)

    # HDBSCAN clustering
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        metric="euclidean",
        cluster_selection_method="eom",
    )
    labels = clusterer.fit_predict(reduced)

    log.info("donors_clustered",
             n_clusters=len(set(labels) - {-1}),
             noise=int((labels == -1).sum()),
             total=len(labels))

    return labels, reduced


def run_donor_clustering(parquet_path: Path) -> int:
    """Run full donor clustering pipeline. Returns rows uploaded."""
    client = get_supabase()

    # Load canonical donor mapping from enrichment.donor_canonical
    result = client.schema("enrichment").table("donor_canonical").select(
        "contribution_id, canonical_id"
    ).execute()
    if not result.data:
        log.warning("no_canonical_donors_found")
        return 0

    canonical_map = {str(r["contribution_id"]): r["canonical_id"] for r in result.data}
    log.info("canonical_map_loaded", entries=len(canonical_map))

    # Compute feature vectors
    donor_vectors = compute_feature_vectors(parquet_path, canonical_map)
    if len(donor_vectors) < 10:
        log.warning("insufficient_donors_for_clustering", count=len(donor_vectors))
        return 0

    # Extract features matrix
    canonical_ids = [d["canonical_id"] for d in donor_vectors]
    features = np.array([d["features"] for d in donor_vectors])

    # Cluster
    labels, reduced = cluster_donors(features, min_cluster_size=max(2, len(features) // 100))

    # Build upload rows for analytics.donor_cluster
    cluster_rows = []
    for i, canonical_id in enumerate(canonical_ids):
        cluster_rows.append({
            "canonical_donor_id": canonical_id,
            "cluster_id": int(labels[i]),
            "cluster_label": None,  # Assigned manually later
            "distance_to_centroid": None,  # Computed below
            "model_version": MODEL_VERSION,
        })

    # Compute centroid distances
    centroids: dict[int, np.ndarray] = {}
    for label in set(labels):
        if label == -1:
            continue
        mask = labels == label
        centroids[label] = reduced[mask].mean(axis=0)

    for i, row in enumerate(cluster_rows):
        label = labels[i]
        if label != -1 and label in centroids:
            dist = float(np.linalg.norm(reduced[i] - centroids[label]))
            row["distance_to_centroid"] = dist

    # Upload cluster assignments
    upsert("donor_cluster", cluster_rows, schema="analytics")

    # Build and upload donor feature vectors (for pgvector similarity search)
    # Pad/truncate reduced embeddings to 64 dims (schema expects vector(64))
    target_dim = 64
    if reduced.shape[1] < target_dim:
        padded = np.zeros((reduced.shape[0], target_dim))
        padded[:, :reduced.shape[1]] = reduced
    else:
        padded = reduced[:, :target_dim]

    vector_rows = []
    for i, canonical_id in enumerate(canonical_ids):
        vector_rows.append({
            "canonical_donor_id": canonical_id,
            "embedding": padded[i].tolist(),
            "total_amount": donor_vectors[i]["features"][0],
            "contribution_count": int(donor_vectors[i]["features"][1]),
            "party_split_d": donor_vectors[i]["features"][2],
            "party_split_r": donor_vectors[i]["features"][3],
            "recipient_type_candidate": donor_vectors[i]["features"][4],
            "recipient_type_pac": donor_vectors[i]["features"][5],
            "geographic_spread": donor_vectors[i]["features"][6],
            "model_version": MODEL_VERSION,
        })

    upsert("donor_feature_vectors", vector_rows, on_conflict="canonical_donor_id", schema="analytics")

    total = len(cluster_rows) + len(vector_rows)
    log.info("donor_clustering_complete", clusters=len(set(labels) - {-1}), rows=total)
    return total
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/smithi/Desktop/beyond-the-vote/pipeline && uv run pytest tests/test_donor_clustering.py -v
```

- [ ] **Step 4: Commit**

```bash
git add pipeline/enrich/donor_clustering.py pipeline/tests/test_donor_clustering.py
git commit -m "feat(pipeline): Tier 2a donor behavioral clustering (UMAP + HDBSCAN)"
```

---

## Task 2: Money flow tracing

**Files:**
- Create: `pipeline/enrich/money_flow.py`
- Create: `pipeline/tests/test_money_flow.py`

- [ ] **Step 1: Write tests**

```python
# pipeline/tests/test_money_flow.py
from pipeline.enrich.money_flow import trace_money_flow, build_pac_graph


def test_build_pac_graph():
    """Build a graph from PAC-to-PAC transfers."""
    transfers = [
        {"source_cmte": "C001", "dest_cmte": "C002", "amount": 5000},
        {"source_cmte": "C002", "dest_cmte": "C003", "amount": 3000},
        {"source_cmte": "C001", "dest_cmte": "C003", "amount": 1000},
    ]
    graph = build_pac_graph(transfers)
    assert len(graph.nodes) == 3
    assert len(graph.edges) == 3
    assert graph["C001"]["C002"]["weight"] == 5000


def test_trace_money_flow_direct():
    """Trace a single-hop flow."""
    transfers = [
        {"source_cmte": "C001", "dest_cmte": "C002", "amount": 5000},
    ]
    graph = build_pac_graph(transfers)
    flows = trace_money_flow(graph, "C002", direction="inbound", max_depth=3)
    assert len(flows) == 1
    assert flows[0]["origin_entity_id"] == "C001"
    assert flows[0]["attributed_amount"] == 5000
    assert flows[0]["hop_count"] == 1


def test_trace_money_flow_multi_hop():
    """Trace a two-hop flow: C001 -> C002 -> C003."""
    transfers = [
        {"source_cmte": "C001", "dest_cmte": "C002", "amount": 10000},
        {"source_cmte": "C002", "dest_cmte": "C003", "amount": 5000},
    ]
    graph = build_pac_graph(transfers)
    flows = trace_money_flow(graph, "C003", direction="inbound", max_depth=3)
    # Should find C002 (direct) and C001 (via C002)
    origins = {f["origin_entity_id"] for f in flows}
    assert "C002" in origins
    assert "C001" in origins


def test_trace_money_flow_outbound():
    """Trace outbound from a source."""
    transfers = [
        {"source_cmte": "C001", "dest_cmte": "C002", "amount": 5000},
        {"source_cmte": "C001", "dest_cmte": "C003", "amount": 3000},
    ]
    graph = build_pac_graph(transfers)
    flows = trace_money_flow(graph, "C001", direction="outbound", max_depth=3)
    assert len(flows) == 2
    dests = {f["destination_committee_id"] for f in flows}
    assert dests == {"C002", "C003"}
```

- [ ] **Step 2: Implement money flow tracing**

```python
# pipeline/enrich/money_flow.py
"""Tier 2d: Money flow tracing through PAC chains."""
from pathlib import Path

import networkx as nx
import structlog

from pipeline.shared.db import upsert, get_supabase
from pipeline.shared.parquet import duckdb_connect

log = structlog.get_logger()

MODEL_VERSION = "money_flow_v1_graph"


def build_pac_graph(transfers: list[dict]) -> nx.DiGraph:
    """Build a directed graph from PAC-to-PAC transfer records.

    Each transfer has: source_cmte, dest_cmte, amount.
    Edge weight = total amount transferred.
    """
    G = nx.DiGraph()
    for t in transfers:
        src = t["source_cmte"]
        dst = t["dest_cmte"]
        amt = float(t.get("amount") or 0)
        if G.has_edge(src, dst):
            G[src][dst]["weight"] += amt
        else:
            G.add_edge(src, dst, weight=amt)
    return G


def trace_money_flow(
    graph: nx.DiGraph,
    entity_id: str,
    direction: str = "inbound",
    max_depth: int = 3,
) -> list[dict]:
    """Trace money flow paths to/from an entity.

    Args:
        graph: PAC transfer graph
        entity_id: committee ID to trace from
        direction: "inbound" (who funds this entity) or "outbound" (where does money go)
        max_depth: max hops to traverse

    Returns: list of flow attribution dicts
    """
    if entity_id not in graph:
        return []

    flows = []

    if direction == "inbound":
        # BFS backwards through predecessors
        visited = set()
        queue = [(entity_id, [], 0)]  # (node, path, depth)

        while queue:
            current, path, depth = queue.pop(0)
            if depth > 0:
                # Calculate attributed amount (product of edge weights along path / total outflow at each hop)
                amount = _compute_attribution(graph, path + [current], entity_id)
                flows.append({
                    "destination_committee_id": entity_id,
                    "origin_entity_id": current,
                    "origin_entity_type": "pac",
                    "attributed_amount": amount,
                    "hop_count": depth,
                    "path": path + [current],
                    "model_version": MODEL_VERSION,
                })

            if depth < max_depth:
                for pred in graph.predecessors(current):
                    if pred not in visited:
                        visited.add(pred)
                        queue.append((pred, path + [current], depth + 1))

    elif direction == "outbound":
        # BFS forward through successors
        visited = set()
        queue = [(entity_id, [], 0)]

        while queue:
            current, path, depth = queue.pop(0)
            if depth > 0:
                amount = graph[path[-1]][current]["weight"] if path else 0
                flows.append({
                    "destination_committee_id": current,
                    "origin_entity_id": entity_id,
                    "origin_entity_type": "pac",
                    "attributed_amount": amount,
                    "hop_count": depth,
                    "path": path + [current],
                    "model_version": MODEL_VERSION,
                })

            if depth < max_depth:
                for succ in graph.successors(current):
                    if succ not in visited:
                        visited.add(succ)
                        queue.append((succ, path + [current], depth + 1))

    return flows


def _compute_attribution(
    graph: nx.DiGraph,
    path: list[str],
    destination: str,
) -> float:
    """Compute weighted attribution along a path.

    For a path [A, B, C, dest], the attribution is:
    weight(A->B) * (weight(B->C) / total_outflow(B)) * (weight(C->dest) / total_outflow(C))
    """
    if len(path) < 2:
        return 0.0

    # Start with the direct edge weight from the last hop
    amount = graph[path[-1]][destination]["weight"] if graph.has_edge(path[-1], destination) else 0.0

    # Walk backwards, applying proportional attribution
    for i in range(len(path) - 1, 0, -1):
        src = path[i - 1]
        dst = path[i]
        if not graph.has_edge(src, dst):
            return 0.0
        edge_weight = graph[src][dst]["weight"]
        total_outflow = sum(graph[src][succ]["weight"] for succ in graph.successors(src))
        if total_outflow > 0:
            proportion = edge_weight / total_outflow
            amount *= proportion

    return round(amount, 2)


def extract_pac_transfers(parquet_path: Path) -> list[dict]:
    """Extract PAC-to-PAC transfers from the pas2 parquet file.

    PAC-to-PAC transfers are records where both cmte_id and other_id (cand_id column
    in pas2) look like committee IDs (start with 'C').
    """
    with duckdb_connect() as conn:
        df = conn.execute(f"""
            SELECT cmte_id as source_cmte,
                   cand_id as dest_cmte,
                   SUM(CAST(transaction_amt AS DOUBLE)) as amount
            FROM read_parquet('{parquet_path}')
            WHERE cand_id LIKE 'C%'
              AND transaction_tp IN ('24K', '24Z', '24A', '24E')
            GROUP BY cmte_id, cand_id
        """).fetchdf()

    transfers = []
    for _, row in df.iterrows():
        transfers.append({
            "source_cmte": row["source_cmte"],
            "dest_cmte": row["dest_cmte"],
            "amount": float(row["amount"]),
        })
    log.info("pac_transfers_extracted", count=len(transfers))
    return transfers


def run_money_flow(parquet_path: Path, cycle: int, max_depth: int = 3) -> int:
    """Run money flow tracing. Returns rows uploaded."""
    transfers = extract_pac_transfers(parquet_path)
    if not transfers:
        log.warning("no_pac_transfers_found")
        return 0

    graph = build_pac_graph(transfers)
    log.info("pac_graph_built", nodes=len(graph.nodes), edges=len(graph.edges))

    # Get all candidate-receiving committees (committees that received from PACs)
    client = get_supabase()
    result = client.schema("fec").table("pac_to_candidate").select(
        "cmte_id"
    ).execute()
    candidate_cmtes = {r["cmte_id"] for r in result.data} if result.data else set()

    # Trace inbound flows for top committees by total received
    all_flows = []
    top_nodes = sorted(
        graph.nodes,
        key=lambda n: sum(graph[pred][n]["weight"] for pred in graph.predecessors(n)),
        reverse=True,
    )[:500]  # Top 500 by inflow

    for node in top_nodes:
        flows = trace_money_flow(graph, node, direction="inbound", max_depth=max_depth)
        for flow in flows:
            flow["cycle"] = cycle
        all_flows.extend(flows)

    if all_flows:
        upsert("money_flow_attribution", all_flows, schema="analytics")

    log.info("money_flow_complete", flows=len(all_flows), committees_traced=len(top_nodes))
    return len(all_flows)
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/smithi/Desktop/beyond-the-vote/pipeline && uv run pytest tests/test_money_flow.py -v
```

- [ ] **Step 4: Commit**

```bash
git add pipeline/enrich/money_flow.py pipeline/tests/test_money_flow.py
git commit -m "feat(pipeline): Tier 2d money flow tracing via PAC graph traversal"
```

---

## Task 3: Tier 2 orchestrator

**Files:**
- Create: `pipeline/scripts/enrich_tier2.py`

- [ ] **Step 1: Create orchestrator**

```python
# pipeline/scripts/enrich_tier2.py
"""Run all Tier 2 ML enrichments.

Usage: uv run python -m pipeline.scripts.enrich_tier2 [--cycles 2024,2026]
"""
import argparse
import sys
from pathlib import Path

import structlog

from pipeline.shared.observability import configure_logging, configure_sentry
from pipeline.shared.db import log_run_start, log_run_end
from pipeline.enrich.donor_clustering import run_donor_clustering
from pipeline.enrich.money_flow import run_money_flow

SCRIPT = "enrich_tier2"
DATA_DIR = Path(__file__).parent.parent / "data"

log = structlog.get_logger()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cycles", type=str, default="2024,2026")
    parser.add_argument("--skip-clustering", action="store_true")
    parser.add_argument("--skip-money-flow", action="store_true")
    args = parser.parse_args()

    cycles = [int(c) for c in args.cycles.split(",")]

    configure_logging(service="pipeline")
    configure_sentry(service="pipeline")

    run_id = log_run_start(SCRIPT)
    total_rows = 0

    try:
        for cycle in cycles:
            indiv_parquet = DATA_DIR / "fec" / str(cycle) / "indiv.parquet"
            pas2_parquet = DATA_DIR / "fec" / str(cycle) / "pas2.parquet"

            if not args.skip_clustering and indiv_parquet.exists():
                log.info("stage_donor_clustering", cycle=cycle)
                total_rows += run_donor_clustering(indiv_parquet)

            if not args.skip_money_flow and pas2_parquet.exists():
                log.info("stage_money_flow", cycle=cycle)
                total_rows += run_money_flow(pas2_parquet, cycle)

        log_run_end(run_id, "success", rows_processed=total_rows)
        log.info("tier2_complete", total_rows=total_rows)

    except Exception as e:
        log.error("tier2_failed", error=str(e))
        log_run_end(run_id, "failed", error_detail=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/scripts/enrich_tier2.py
git commit -m "feat(pipeline): Tier 2 ML enrichment orchestrator"
```

---

## Task 4: Donor similarity API endpoint

**Files:**
- Create: `apps/api/app/routers/donor_similarity.py`

- [ ] **Step 1: Create endpoint**

```python
# apps/api/app/routers/donor_similarity.py
"""Donor similarity search via pgvector nearest-neighbor."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db

router = APIRouter(tags=["ml"])


@router.get("/api/donors/{canonical_donor_id}/similar")
async def find_similar_donors(
    canonical_donor_id: str,
    limit: int = Query(default=10, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Find donors with similar giving patterns via pgvector cosine similarity."""
    # Get the donor's embedding
    embed_result = await db.execute(
        text("""SELECT embedding, total_amount, contribution_count,
                       party_split_d, party_split_r,
                       recipient_type_candidate, recipient_type_pac,
                       geographic_spread
                FROM analytics.donor_feature_vectors
                WHERE canonical_donor_id = :id"""),
        {"id": canonical_donor_id},
    )
    donor = embed_result.mappings().first()
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found or not yet clustered")

    # Find nearest neighbors via HNSW index
    sql = """
    SELECT dfv.canonical_donor_id,
           1 - (dfv.embedding <=> (SELECT embedding FROM analytics.donor_feature_vectors WHERE canonical_donor_id = :id)) AS similarity,
           dfv.total_amount,
           dfv.contribution_count,
           dfv.party_split_d,
           dfv.party_split_r,
           dfv.recipient_type_candidate,
           dfv.recipient_type_pac,
           dfv.geographic_spread,
           dc.cluster_id,
           dc.cluster_label
    FROM analytics.donor_feature_vectors dfv
    LEFT JOIN analytics.donor_cluster dc ON dc.canonical_donor_id = dfv.canonical_donor_id
    WHERE dfv.canonical_donor_id != :id
    ORDER BY dfv.embedding <=> (SELECT embedding FROM analytics.donor_feature_vectors WHERE canonical_donor_id = :id)
    LIMIT :limit
    """
    result = await db.execute(text(sql), {"id": canonical_donor_id, "limit": limit})
    rows = result.mappings().all()

    # Get source donor's cluster for comparison
    source_cluster_result = await db.execute(
        text("SELECT cluster_id, cluster_label FROM analytics.donor_cluster WHERE canonical_donor_id = :id"),
        {"id": canonical_donor_id},
    )
    source_cluster = source_cluster_result.mappings().first()

    similar_donors = []
    for r in rows:
        similar_donors.append({
            "canonicalDonorId": r["canonical_donor_id"],
            "similarity": round(float(r["similarity"]), 4),
            "totalAmount": float(r.get("total_amount") or 0),
            "contributionCount": int(r.get("contribution_count") or 0),
            "partySplitD": round(float(r.get("party_split_d") or 0), 3),
            "partySplitR": round(float(r.get("party_split_r") or 0), 3),
            "sameCluster": r.get("cluster_id") == (source_cluster["cluster_id"] if source_cluster else None),
            "clusterId": r.get("cluster_id"),
            "clusterLabel": r.get("cluster_label"),
        })

    return {
        "donorId": canonical_donor_id,
        "sourceCluster": {
            "id": source_cluster["cluster_id"] if source_cluster else None,
            "label": source_cluster["cluster_label"] if source_cluster else None,
        },
        "similarDonors": similar_donors,
    }
```

- [ ] **Step 2: Wire to main.py and commit**

Add to `apps/api/app/main.py`:
```python
from app.routers import donor_similarity
app.include_router(donor_similarity.router)
```

```bash
git add apps/api/app/routers/donor_similarity.py apps/api/app/main.py
git commit -m "feat(api): donor similarity endpoint via pgvector nearest-neighbor"
```

---

## Task 5: Follow-the-money API endpoint

**Files:**
- Create: `apps/api/app/routers/money_flow.py`

- [ ] **Step 1: Create endpoint**

```python
# apps/api/app/routers/money_flow.py
"""Follow-the-money endpoint — trace PAC chain flows."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db

router = APIRouter(tags=["ml"])


@router.get("/api/money-flow/{entity_id}")
async def follow_the_money(
    entity_id: str,
    direction: str = Query(default="inbound", regex="^(inbound|outbound)$"),
    depth: int = Query(default=3, ge=1, le=5),
    db: AsyncSession = Depends(get_db),
):
    """Trace money flow through PAC chains.

    Returns a graph of money flow with amounts, hop counts, and attribution.
    """
    # Query materialized money flow attribution
    if direction == "inbound":
        sql = """
        SELECT mfa.origin_entity_id, mfa.origin_entity_type,
               mfa.attributed_amount, mfa.hop_count, mfa.path, mfa.cycle,
               cn.cmte_name AS origin_name
        FROM analytics.money_flow_attribution mfa
        LEFT JOIN fec.cmte_names cn ON cn.cmte_id = mfa.origin_entity_id
        WHERE mfa.destination_committee_id = :entity_id
          AND mfa.hop_count <= :depth
        ORDER BY mfa.attributed_amount DESC
        LIMIT 50
        """
    else:
        sql = """
        SELECT mfa.destination_committee_id, mfa.origin_entity_type,
               mfa.attributed_amount, mfa.hop_count, mfa.path, mfa.cycle,
               cn.cmte_name AS dest_name
        FROM analytics.money_flow_attribution mfa
        LEFT JOIN fec.cmte_names cn ON cn.cmte_id = mfa.destination_committee_id
        WHERE mfa.origin_entity_id = :entity_id
          AND mfa.hop_count <= :depth
        ORDER BY mfa.attributed_amount DESC
        LIMIT 50
        """

    result = await db.execute(text(sql), {"entity_id": entity_id, "depth": depth})
    rows = result.mappings().all()

    if not rows:
        # Check if entity exists at all
        check = await db.execute(
            text("SELECT cmte_name FROM fec.cmte_names WHERE cmte_id = :id"),
            {"id": entity_id},
        )
        entity = check.mappings().first()
        if not entity:
            raise HTTPException(status_code=404, detail="Entity not found")
        return {"entityId": entity_id, "entityName": entity["cmte_name"], "direction": direction, "flows": [], "message": "No money flow data available"}

    # Build nodes and edges for graph visualization
    nodes = {}
    edges = []

    # Add source node
    entity_name_result = await db.execute(
        text("SELECT cmte_name FROM fec.cmte_names WHERE cmte_id = :id"),
        {"id": entity_id},
    )
    entity_name_row = entity_name_result.mappings().first()
    nodes[entity_id] = {"id": entity_id, "name": entity_name_row["cmte_name"] if entity_name_row else entity_id, "type": "target"}

    for r in rows:
        if direction == "inbound":
            origin_id = r["origin_entity_id"]
            nodes[origin_id] = {"id": origin_id, "name": r.get("origin_name") or origin_id, "type": r.get("origin_entity_type", "pac")}
            edges.append({
                "from": origin_id,
                "to": entity_id,
                "amount": float(r["attributed_amount"]),
                "hopCount": r["hop_count"],
                "path": r.get("path") or [],
            })
        else:
            dest_id = r["destination_committee_id"]
            nodes[dest_id] = {"id": dest_id, "name": r.get("dest_name") or dest_id, "type": "pac"}
            edges.append({
                "from": entity_id,
                "to": dest_id,
                "amount": float(r["attributed_amount"]),
                "hopCount": r["hop_count"],
                "path": r.get("path") or [],
            })

    # Add intermediate nodes from paths
    for edge in edges:
        for node_id in edge.get("path", []):
            if node_id not in nodes:
                nodes[node_id] = {"id": node_id, "name": node_id, "type": "intermediate"}

    total_flow = sum(e["amount"] for e in edges)

    return {
        "entityId": entity_id,
        "entityName": nodes[entity_id]["name"],
        "direction": direction,
        "totalFlow": round(total_flow, 2),
        "nodes": list(nodes.values()),
        "edges": edges,
    }
```

- [ ] **Step 2: Wire to main.py, run tests, commit**

Add to `apps/api/app/main.py`:
```python
from app.routers import money_flow
app.include_router(money_flow.router)
```

Run all API tests:
```bash
cd /Users/smithi/Desktop/beyond-the-vote/apps/api && uv run pytest tests/ -v
```

```bash
git add apps/api/app/routers/money_flow.py apps/api/app/main.py
git commit -m "feat(api): follow-the-money endpoint with PAC chain graph"
```

---

## Parallel execution map

```
Task 1 (donor clustering) ──────────────────► Task 4 (donor similarity API)
Task 2 (money flow tracing) ─────────────────► Task 5 (follow-the-money API)
Task 3 (orchestrator) — depends on Tasks 1+2

Tasks 1, 2 can run in parallel (independent pipeline enrichments)
Tasks 4, 5 can run in parallel (independent API endpoints)
Task 3 depends on 1+2
```
