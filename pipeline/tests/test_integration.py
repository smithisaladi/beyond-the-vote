"""Integration tests that require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
Run with: uv run pytest tests/test_integration.py -v
"""
import os
import pytest

pytestmark = pytest.mark.skipif(
    not os.getenv("SUPABASE_URL"),
    reason="SUPABASE_URL not set — skipping integration tests",
)


def test_integration_legislator_load():
    """Load a single legislator and verify it exists in congress.legislators."""
    from shared.db import get_supabase, upsert

    test_row = {
        "bioguide_id": "TEST0001",
        "first_name": "Test",
        "last_name": "Legislator",
        "full_name": "Test Legislator",
        "party": "Independent",
        "chamber": "Senate",
        "state": "DC",
        "state_full": "District of Columbia",
        "title": "Senator",
        "in_office": False,
        "fec_ids": [],
        "photo_url": "https://example.com/photo.jpg",
    }

    upsert("legislators", [test_row], on_conflict="bioguide_id", schema="congress")

    client = get_supabase()
    result = (
        client.schema("congress")
        .table("legislators")
        .select("*")
        .eq("bioguide_id", "TEST0001")
        .execute()
    )
    assert len(result.data) == 1
    assert result.data[0]["full_name"] == "Test Legislator"

    # Cleanup
    client.schema("congress").table("legislators").delete().eq("bioguide_id", "TEST0001").execute()


def test_integration_pipeline_run_logging():
    """Verify pipeline run logging works end-to-end."""
    from shared.db import log_run_start, log_run_end, get_watermark, get_supabase

    run_id = log_run_start("test_integration")
    log_run_end(run_id, "success", rows_processed=42)

    watermark = get_watermark("test_integration")
    assert watermark is not None

    # Cleanup
    client = get_supabase()
    client.schema("ops").table("pipeline_runs").delete().eq("id", run_id).execute()
