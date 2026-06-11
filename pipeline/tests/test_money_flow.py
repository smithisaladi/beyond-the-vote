# pipeline/tests/test_money_flow.py
from enrich.money_flow import trace_money_flow, build_pac_graph, add_individual_edges


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
    jane = [f for f in flows if f["origin_entity_id"] == "d_12345"][0]
    assert jane["attributed_amount"] == 50000
    assert jane["path"] == ["d_12345", "C002"]


def test_add_individual_edges_empty():
    """Empty top_funders list produces no flows."""
    flows = add_individual_edges([], cycle=2024)
    assert flows == []
