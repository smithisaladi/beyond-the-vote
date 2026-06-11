"""Tests for load/embeddings.py — robust bill embedding pipeline."""
import pytest
from unittest.mock import patch, MagicMock, call
import numpy as np


MODULE = "load.embeddings"


@pytest.fixture
def mock_conn():
    conn = MagicMock()
    cursor = MagicMock()
    conn.cursor.return_value = cursor
    return conn, cursor


@pytest.fixture
def mock_model():
    return MagicMock(name="SentenceTransformerModel")


def _fake_embedding(n=1):
    """Return a list of n fake 384-dim embeddings."""
    return [np.zeros(384).tolist() for _ in range(n)]


class TestSkipEmptyTextBills:
    """Bills where both title and summary are NULL/empty should be skipped."""

    @patch(f"{MODULE}.upsert", return_value=1)
    @patch(f"{MODULE}.embed_texts")
    @patch(f"{MODULE}.get_model")
    @patch(f"{MODULE}.get_conn")
    def test_empty_text_bills_are_skipped(self, mock_get_conn, mock_get_model, mock_embed, mock_upsert, mock_conn, mock_model):
        conn, cursor = mock_conn
        mock_get_conn.return_value = conn
        mock_get_model.return_value = mock_model

        cursor.fetchall.side_effect = [
            [],  # existing embeddings query
            [
                ("bill-1", "Clean Energy Act", "A bill about clean energy"),
                ("bill-2", None, None),       # empty — should be skipped
                ("bill-3", "", ""),            # empty — should be skipped
                ("bill-4", "", None),          # empty — should be skipped
                ("bill-5", "Healthcare", None),  # has title — should embed
            ],
            [],  # stale bills query
            [(5,)],  # coverage: total_bills
            [(2,)],  # coverage: embedded_bills
        ]

        mock_embed.return_value = _fake_embedding(2)

        from load.embeddings import load_bill_embeddings
        total = load_bill_embeddings(batch_size=500)

        # Only bill-1 and bill-5 should be embedded
        assert total == 2
        assert mock_embed.call_count == 1
        texts_arg = mock_embed.call_args[0][1]
        assert len(texts_arg) == 2


class TestStaleReEmbed:
    """Bills embedded without summary should be re-embedded when summary arrives."""

    @patch(f"{MODULE}.upsert", return_value=1)
    @patch(f"{MODULE}.embed_texts")
    @patch(f"{MODULE}.get_model")
    @patch(f"{MODULE}.get_conn")
    def test_stale_bills_get_reembedded(self, mock_get_conn, mock_get_model, mock_embed, mock_upsert, mock_conn, mock_model):
        conn, cursor = mock_conn
        mock_get_conn.return_value = conn
        mock_get_model.return_value = mock_model

        cursor.fetchall.side_effect = [
            [("bill-1",)],  # existing embeddings — bill-1 already embedded
            [
                ("bill-1", "Old Bill", "Now has summary"),
                ("bill-2", "New Bill", "Summary too"),
            ],
            # stale bills: bill-3 had no summary before, now has one
            [("bill-3", "Stale Bill", "Fresh summary")],
            [(3,)],  # coverage: total_bills
            [(3,)],  # coverage: embedded_bills
        ]

        mock_embed.side_effect = [
            _fake_embedding(1),  # new bills batch (bill-2 only)
            _fake_embedding(1),  # stale re-embed (bill-3)
        ]

        from load.embeddings import load_bill_embeddings
        total = load_bill_embeddings(batch_size=500)

        # bill-2 is new, bill-3 is stale re-embed
        assert total == 2
        # embed_texts called twice: once for new bills, once for stale
        assert mock_embed.call_count == 2


class TestBatchErrorHandling:
    """A batch encoding failure should not crash the whole run."""

    @patch(f"{MODULE}.upsert", return_value=2)
    @patch(f"{MODULE}.embed_texts")
    @patch(f"{MODULE}.get_model")
    @patch(f"{MODULE}.get_conn")
    def test_batch_failure_continues(self, mock_get_conn, mock_get_model, mock_embed, mock_upsert, mock_conn, mock_model):
        conn, cursor = mock_conn
        mock_get_conn.return_value = conn
        mock_get_model.return_value = mock_model

        # 4 bills, batch_size=2 → 2 batches
        cursor.fetchall.side_effect = [
            [],  # existing
            [
                ("bill-1", "Bill One", "Summary one"),
                ("bill-2", "Bill Two", "Summary two"),
                ("bill-3", "Bill Three", "Summary three"),
                ("bill-4", "Bill Four", "Summary four"),
            ],
            [],  # stale
            [(4,)],  # coverage: total
            [(2,)],  # coverage: embedded
        ]

        # First batch fails, second succeeds
        mock_embed.side_effect = [
            RuntimeError("CUDA out of memory"),
            _fake_embedding(2),
        ]

        from load.embeddings import load_bill_embeddings
        total = load_bill_embeddings(batch_size=2)

        # Only second batch succeeded
        assert total == 2
        assert mock_embed.call_count == 2
        # upsert called once (only for successful batch)
        assert mock_upsert.call_count == 1


class TestCoverageLogging:
    """Coverage percentage should be logged, with a warning if < 95%."""

    @patch(f"{MODULE}.upsert", return_value=0)
    @patch(f"{MODULE}.embed_texts")
    @patch(f"{MODULE}.get_model")
    @patch(f"{MODULE}.get_conn")
    def test_coverage_logged(self, mock_get_conn, mock_get_model, mock_embed, mock_upsert, mock_conn, mock_model):
        conn, cursor = mock_conn
        mock_get_conn.return_value = conn
        mock_get_model.return_value = mock_model

        cursor.fetchall.side_effect = [
            [],  # existing
            [],  # all bills (none)
            [],  # stale
            [(100,)],  # coverage: 100 total
            [(50,)],   # coverage: 50 embedded → 50%
        ]

        from load.embeddings import load_bill_embeddings
        with patch(f"{MODULE}.log") as mock_log:
            load_bill_embeddings(batch_size=500)
            # Check that warning was logged (coverage < 95%)
            warn_calls = [c for c in mock_log.warning.call_args_list
                          if c[0][0] == "low_embedding_coverage"]
            assert len(warn_calls) == 1


class TestHasSummaryTracking:
    """Embedded rows should track whether summary was present."""

    @patch(f"{MODULE}.upsert", return_value=1)
    @patch(f"{MODULE}.embed_texts")
    @patch(f"{MODULE}.get_model")
    @patch(f"{MODULE}.get_conn")
    def test_has_summary_flag_set(self, mock_get_conn, mock_get_model, mock_embed, mock_upsert, mock_conn, mock_model):
        conn, cursor = mock_conn
        mock_get_conn.return_value = conn
        mock_get_model.return_value = mock_model

        cursor.fetchall.side_effect = [
            [],  # existing
            [
                ("bill-1", "Title Only", None),
                ("bill-2", "With Summary", "A real summary"),
            ],
            [],  # stale
            [(2,)],  # coverage: total
            [(2,)],  # coverage: embedded
        ]

        mock_embed.return_value = _fake_embedding(2)

        from load.embeddings import load_bill_embeddings
        load_bill_embeddings(batch_size=500)

        # Check the rows passed to upsert
        upsert_call = mock_upsert.call_args_list[0]
        rows = upsert_call[0][1]
        bill_1_row = next(r for r in rows if r["bill_id"] == "bill-1")
        bill_2_row = next(r for r in rows if r["bill_id"] == "bill-2")
        assert bill_1_row["has_summary"] is False
        assert bill_2_row["has_summary"] is True
