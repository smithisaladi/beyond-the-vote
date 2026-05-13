# pipeline/enrich/money_flow.py
"""Tier 2d: Money flow tracing through PAC chains."""
from pathlib import Path
import networkx as nx
import structlog
import psycopg2.extras

from shared.db import upsert, get_conn
from shared.parquet import duckdb_connect

log = structlog.get_logger()
MODEL_VERSION = "money_flow_v1_graph"


def build_pac_graph(transfers: list[dict]) -> nx.DiGraph:
    G = nx.DiGraph()
    for t in transfers:
        src, dst = t["source_cmte"], t["dest_cmte"]
        amt = float(t.get("amount") or 0)
        if G.has_edge(src, dst):
            G[src][dst]["weight"] += amt
        else:
            G.add_edge(src, dst, weight=amt)
    return G


def trace_money_flow(graph: nx.DiGraph, entity_id: str, direction: str = "inbound", max_depth: int = 3) -> list[dict]:
    if entity_id not in graph:
        return []
    flows = []

    if direction == "inbound":
        visited = set()
        queue = [(entity_id, [], 0)]
        while queue:
            current, path, depth = queue.pop(0)
            if depth > 0:
                # path is destination-first: [entity_id, intermediate..., current]
                # Reverse to get origin-first path for _compute_attribution: [current, ..., last_hop]
                # Drop the last element after reversing because that's entity_id (the destination),
                # which must NOT be included in the path per _compute_attribution's contract.
                reversed_full = list(reversed(path + [current]))
                origin_first_path = reversed_full[:-1]  # exclude destination from path
                amount = _compute_attribution(graph, origin_first_path, entity_id)
                flows.append({
                    "destination_committee_id": entity_id, "origin_entity_id": current,
                    "origin_entity_type": "pac", "attributed_amount": amount,
                    "hop_count": depth, "path": origin_first_path, "model_version": MODEL_VERSION,
                })
            if depth < max_depth:
                for pred in graph.predecessors(current):
                    if pred not in visited:
                        visited.add(pred)
                        queue.append((pred, path + [current], depth + 1))

    elif direction == "outbound":
        visited = set()
        queue = [(entity_id, [], 0)]
        while queue:
            current, path, depth = queue.pop(0)
            if depth > 0:
                amount = graph[path[-1]][current]["weight"] if path else 0
                flows.append({
                    "destination_committee_id": current, "origin_entity_id": entity_id,
                    "origin_entity_type": "pac", "attributed_amount": amount,
                    "hop_count": depth, "path": path + [current], "model_version": MODEL_VERSION,
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
    """Compute weighted attribution along a path to the destination.

    Path is origin-first: [origin, ..., last_hop_node].
    The destination is NOT in the path.
    Attribution = direct_edge_weight * product of (edge_weight / total_outflow) along intermediate hops.
    """
    if not path:
        return 0.0

    # The last node in path connects directly to destination
    last_node = path[-1]
    if not graph.has_edge(last_node, destination):
        return 0.0

    # Start with the direct contribution from last_node to destination
    amount = graph[last_node][destination]["weight"]

    # Walk backwards through intermediate nodes, applying proportional attribution
    for i in range(len(path) - 1, 0, -1):
        src = path[i - 1]
        dst = path[i]
        if not graph.has_edge(src, dst):
            return 0.0
        edge_weight = graph[src][dst]["weight"]
        total_outflow = sum(graph[src][succ]["weight"] for succ in graph.successors(src))
        if total_outflow > 0:
            amount *= edge_weight / total_outflow

    return round(amount, 2)


def extract_pac_transfers(parquet_path: Path) -> list[dict]:
    with duckdb_connect() as conn:
        # PAC-to-candidate transfers (cand_id = H/S/P...)
        # plus PAC-to-PAC transfers (other_id = C...)
        df = conn.execute(f"""
            SELECT source_cmte, dest_id, SUM(amount) as amount FROM (
                -- PAC to candidate
                SELECT cmte_id as source_cmte, cand_id as dest_id,
                       CAST(transaction_amt AS DOUBLE) as amount
                FROM read_parquet('{parquet_path}')
                WHERE cand_id IS NOT NULL AND cand_id != ''
                  AND transaction_tp IN ('24K', '24Z', '24A', '24E')
                UNION ALL
                -- PAC to PAC (other_id starts with C = committee)
                SELECT cmte_id as source_cmte, other_id as dest_id,
                       CAST(transaction_amt AS DOUBLE) as amount
                FROM read_parquet('{parquet_path}')
                WHERE other_id LIKE 'C%'
                  AND transaction_tp IN ('24K', '24Z')
            )
            GROUP BY source_cmte, dest_id
        """).fetchdf()
    transfers = [{"source_cmte": row["source_cmte"], "dest_cmte": row["dest_id"], "amount": float(row["amount"])}
                 for _, row in df.iterrows()]
    log.info("pac_transfers_extracted", count=len(transfers))
    return transfers


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

    if all_flows:
        upsert("money_flow_attribution", all_flows, schema="analytics")

    log.info("money_flow_complete", flows=len(all_flows), committees_traced=len(top_nodes))
    return len(all_flows)
