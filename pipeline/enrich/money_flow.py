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
                amount = _compute_attribution(graph, path + [current], entity_id)
                flows.append({
                    "destination_committee_id": entity_id, "origin_entity_id": current,
                    "origin_entity_type": "pac", "attributed_amount": amount,
                    "hop_count": depth, "path": path + [current], "model_version": MODEL_VERSION,
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


def _compute_attribution(graph: nx.DiGraph, path: list[str], destination: str) -> float:
    # path is stored destination-first (e.g. [dest, intermediate..., origin]).
    # Reverse to get the forward origin-to-destination chain.
    if len(path) < 2:
        return 0.0
    forward = list(reversed(path))
    # forward[0] is the origin, forward[-1] is the destination
    amount = graph[forward[-2]][forward[-1]]["weight"] if graph.has_edge(forward[-2], forward[-1]) else 0.0
    if amount == 0.0:
        return 0.0
    for i in range(len(forward) - 2):
        src, dst = forward[i], forward[i + 1]
        if not graph.has_edge(src, dst):
            return 0.0
        edge_weight = graph[src][dst]["weight"]
        total_outflow = sum(graph[src][succ]["weight"] for succ in graph.successors(src))
        if total_outflow > 0:
            amount *= edge_weight / total_outflow
    return round(amount, 2)


def extract_pac_transfers(parquet_path: Path) -> list[dict]:
    with duckdb_connect() as conn:
        df = conn.execute(f"""
            SELECT cmte_id as source_cmte, cand_id as dest_cmte,
                   SUM(CAST(transaction_amt AS DOUBLE)) as amount
            FROM read_parquet('{parquet_path}')
            WHERE cand_id LIKE 'C%' AND transaction_tp IN ('24K', '24Z', '24A', '24E')
            GROUP BY cmte_id, cand_id
        """).fetchdf()
    transfers = [{"source_cmte": row["source_cmte"], "dest_cmte": row["dest_cmte"], "amount": float(row["amount"])}
                 for _, row in df.iterrows()]
    log.info("pac_transfers_extracted", count=len(transfers))
    return transfers


def run_money_flow(parquet_path: Path, cycle: int, max_depth: int = 3) -> int:
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
