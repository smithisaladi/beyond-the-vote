# pipeline/tests/test_money_flow.py
from enrich.money_flow import trace_money_flow, build_pac_graph


def test_build_pac_graph():
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
    transfers = [{"source_cmte": "C001", "dest_cmte": "C002", "amount": 5000}]
    graph = build_pac_graph(transfers)
    flows = trace_money_flow(graph, "C002", direction="inbound", max_depth=3)
    assert len(flows) == 1
    assert flows[0]["origin_entity_id"] == "C001"
    assert flows[0]["attributed_amount"] == 5000
    assert flows[0]["hop_count"] == 1


def test_trace_money_flow_multi_hop():
    transfers = [
        {"source_cmte": "C001", "dest_cmte": "C002", "amount": 10000},
        {"source_cmte": "C002", "dest_cmte": "C003", "amount": 5000},
    ]
    graph = build_pac_graph(transfers)
    flows = trace_money_flow(graph, "C003", direction="inbound", max_depth=3)
    origins = {f["origin_entity_id"] for f in flows}
    assert "C002" in origins
    assert "C001" in origins


def test_trace_money_flow_outbound():
    transfers = [
        {"source_cmte": "C001", "dest_cmte": "C002", "amount": 5000},
        {"source_cmte": "C001", "dest_cmte": "C003", "amount": 3000},
    ]
    graph = build_pac_graph(transfers)
    flows = trace_money_flow(graph, "C001", direction="outbound", max_depth=3)
    assert len(flows) == 2
    dests = {f["destination_committee_id"] for f in flows}
    assert dests == {"C002", "C003"}
