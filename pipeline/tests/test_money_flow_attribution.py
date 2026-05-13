"""Tests for money flow attribution in enrich/money_flow.py."""
import pytest
from unittest.mock import patch, MagicMock
import pandas as pd

from enrich.money_flow import (
    build_pac_graph,
    extract_pac_transfers,
    trace_money_flow,
    _compute_attribution,
)


# ── build_pac_graph tests ────────────────────────────────────────────────────


class TestBuildPacGraph:
    def test_builds_correct_directed_graph(self):
        transfers = [
            {"source_cmte": "C001", "dest_cmte": "C002", "amount": 5000},
            {"source_cmte": "C002", "dest_cmte": "C003", "amount": 3000},
        ]
        graph = build_pac_graph(transfers)
        assert len(graph.nodes) == 3
        assert len(graph.edges) == 2
        assert graph["C001"]["C002"]["weight"] == 5000
        assert graph["C002"]["C003"]["weight"] == 3000

    def test_accumulates_duplicate_edges(self):
        transfers = [
            {"source_cmte": "C001", "dest_cmte": "C002", "amount": 5000},
            {"source_cmte": "C001", "dest_cmte": "C002", "amount": 3000},
        ]
        graph = build_pac_graph(transfers)
        assert len(graph.edges) == 1
        assert graph["C001"]["C002"]["weight"] == 8000

    def test_empty_transfers(self):
        graph = build_pac_graph([])
        assert len(graph.nodes) == 0
        assert len(graph.edges) == 0

    def test_handles_zero_amount(self):
        transfers = [{"source_cmte": "C001", "dest_cmte": "C002", "amount": 0}]
        graph = build_pac_graph(transfers)
        assert graph["C001"]["C002"]["weight"] == 0

    def test_handles_none_amount(self):
        transfers = [{"source_cmte": "C001", "dest_cmte": "C002", "amount": None}]
        graph = build_pac_graph(transfers)
        assert graph["C001"]["C002"]["weight"] == 0


# ── extract_pac_transfers tests ──────────────────────────────────────────────


class TestExtractPacTransfers:
    @patch("enrich.money_flow.duckdb_connect")
    def test_returns_correct_transfer_format(self, mock_duckdb_connect):
        mock_conn = MagicMock()
        mock_duckdb_connect.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_duckdb_connect.return_value.__exit__ = MagicMock(return_value=False)

        # Simulate DataFrame with PAC-to-candidate and PAC-to-PAC transfers
        df = pd.DataFrame({
            "source_cmte": ["C001", "C002"],
            "dest_id": ["H001", "C003"],
            "amount": [5000.0, 3000.0],
        })
        mock_conn.execute.return_value.fetchdf.return_value = df

        from pathlib import Path
        result = extract_pac_transfers(Path("/fake/path.parquet"))

        assert len(result) == 2
        assert result[0]["source_cmte"] == "C001"
        assert result[0]["dest_cmte"] == "H001"
        assert result[0]["amount"] == 5000.0
        assert result[1]["source_cmte"] == "C002"
        assert result[1]["dest_cmte"] == "C003"
        assert result[1]["amount"] == 3000.0

    @patch("enrich.money_flow.duckdb_connect")
    def test_returns_empty_for_no_transfers(self, mock_duckdb_connect):
        mock_conn = MagicMock()
        mock_duckdb_connect.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_duckdb_connect.return_value.__exit__ = MagicMock(return_value=False)

        df = pd.DataFrame(columns=["source_cmte", "dest_id", "amount"])
        mock_conn.execute.return_value.fetchdf.return_value = df

        from pathlib import Path
        result = extract_pac_transfers(Path("/fake/path.parquet"))
        assert result == []


# ── trace_money_flow inbound tests ───────────────────────────────────────────


class TestTraceMoneyFlowInbound:
    def test_traces_all_predecessors(self):
        transfers = [
            {"source_cmte": "A", "dest_cmte": "B", "amount": 10000},
            {"source_cmte": "B", "dest_cmte": "C", "amount": 5000},
            {"source_cmte": "D", "dest_cmte": "C", "amount": 3000},
        ]
        graph = build_pac_graph(transfers)
        flows = trace_money_flow(graph, "C", direction="inbound", max_depth=3)
        origins = {f["origin_entity_id"] for f in flows}
        assert origins == {"B", "D", "A"}

    def test_respects_visited_set(self):
        """Cycle in graph should not cause infinite loop."""
        transfers = [
            {"source_cmte": "A", "dest_cmte": "B", "amount": 5000},
            {"source_cmte": "B", "dest_cmte": "C", "amount": 3000},
            {"source_cmte": "C", "dest_cmte": "A", "amount": 1000},
        ]
        graph = build_pac_graph(transfers)
        flows = trace_money_flow(graph, "C", direction="inbound", max_depth=5)
        # Should terminate despite the cycle
        origin_ids = [f["origin_entity_id"] for f in flows]
        assert len(origin_ids) == len(set(origin_ids))  # no duplicates

    def test_depth_limiting(self):
        transfers = [
            {"source_cmte": "A", "dest_cmte": "B", "amount": 10000},
            {"source_cmte": "B", "dest_cmte": "C", "amount": 5000},
            {"source_cmte": "C", "dest_cmte": "D", "amount": 2500},
        ]
        graph = build_pac_graph(transfers)
        flows = trace_money_flow(graph, "D", direction="inbound", max_depth=1)
        assert all(f["hop_count"] <= 1 for f in flows)
        origins = {f["origin_entity_id"] for f in flows}
        assert origins == {"C"}

    def test_missing_entity_returns_empty(self):
        graph = build_pac_graph([])
        flows = trace_money_flow(graph, "NONEXISTENT", direction="inbound")
        assert flows == []


# ── trace_money_flow outbound tests ──────────────────────────────────────────


class TestTraceMoneyFlowOutbound:
    def test_traces_all_successors(self):
        transfers = [
            {"source_cmte": "A", "dest_cmte": "B", "amount": 5000},
            {"source_cmte": "A", "dest_cmte": "C", "amount": 3000},
            {"source_cmte": "B", "dest_cmte": "D", "amount": 2000},
        ]
        graph = build_pac_graph(transfers)
        flows = trace_money_flow(graph, "A", direction="outbound", max_depth=3)
        dests = {f["destination_committee_id"] for f in flows}
        assert dests == {"B", "C", "D"}

    def test_outbound_hop_counts(self):
        transfers = [
            {"source_cmte": "A", "dest_cmte": "B", "amount": 5000},
            {"source_cmte": "B", "dest_cmte": "C", "amount": 3000},
        ]
        graph = build_pac_graph(transfers)
        flows = trace_money_flow(graph, "A", direction="outbound", max_depth=3)
        hop_map = {f["destination_committee_id"]: f["hop_count"] for f in flows}
        assert hop_map["B"] == 1
        assert hop_map["C"] == 2


# ── _compute_attribution tests ───────────────────────────────────────────────


class TestComputeAttribution:
    def test_single_hop_direct_weight(self):
        transfers = [{"source_cmte": "A", "dest_cmte": "B", "amount": 5000}]
        graph = build_pac_graph(transfers)
        # path = [A], destination = B
        result = _compute_attribution(graph, ["A"], "B")
        assert result == 5000.0

    def test_multi_hop_proportional(self):
        """A -> B (10K), A -> C (10K), B -> D (5K).
        Attribution of A through B to D:
        A's share of B's outflow = edge(A,B)/total_outflow(A) * edge(B,D)
        But _compute_attribution walks from path[-1] to dest, then back through intermediates.
        path = [A, B], dest = D.
        Start: amount = edge(B, D) = 5000
        Walk back: src=A, dst=B => edge(A,B)=10000, total_outflow(A)=20000
        amount *= 10000/20000 = 0.5 => 2500
        """
        transfers = [
            {"source_cmte": "A", "dest_cmte": "B", "amount": 10000},
            {"source_cmte": "A", "dest_cmte": "C", "amount": 10000},
            {"source_cmte": "B", "dest_cmte": "D", "amount": 5000},
        ]
        graph = build_pac_graph(transfers)
        result = _compute_attribution(graph, ["A", "B"], "D")
        assert result == 2500.0

    def test_empty_path_returns_zero(self):
        graph = build_pac_graph([])
        result = _compute_attribution(graph, [], "B")
        assert result == 0.0

    def test_missing_edge_returns_zero(self):
        transfers = [{"source_cmte": "A", "dest_cmte": "B", "amount": 5000}]
        graph = build_pac_graph(transfers)
        # path says [A] -> C, but no edge A->C
        result = _compute_attribution(graph, ["A"], "C")
        assert result == 0.0

    def test_single_outflow_full_attribution(self):
        """When A only flows to B and B only flows to C, full attribution."""
        transfers = [
            {"source_cmte": "A", "dest_cmte": "B", "amount": 10000},
            {"source_cmte": "B", "dest_cmte": "C", "amount": 7000},
        ]
        graph = build_pac_graph(transfers)
        # path = [A, B], dest = C
        # amount = edge(B,C) = 7000, then A->B: 10000/10000 = 1.0 => 7000
        result = _compute_attribution(graph, ["A", "B"], "C")
        assert result == 7000.0
