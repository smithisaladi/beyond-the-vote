"""Real hybrid-search behavior: FTS + trigram + RRF, and the semantic leg."""
import pytest
from tests.integration import seed

pytestmark = [pytest.mark.integration, pytest.mark.asyncio(loop_scope="session")]


async def _seed_corpus(db):
    await seed.add_bill(db, bill_id="hr1-118", title="Clean Water Restoration Act",
                        summary="Protects rivers and drinking water.", bill_number="H.R. 1",
                        topics=["environment"])
    await seed.add_bill(db, bill_id="hr2-118", title="National Defense Authorization Act",
                        summary="Funds the armed forces.", bill_number="H.R. 2",
                        topics=["defense"])
    await seed.add_bill(db, bill_id="hr3-118", title="Affordable Housing Act",
                        summary="Expands housing assistance.", bill_number="H.R. 3",
                        topics=["housing"])


async def test_fts_returns_matching_bill_first(client, db, disable_embeddings):
    await _seed_corpus(db)
    resp = await client.get("/api/bills", params={"q": "water"})
    assert resp.status_code == 200
    ids = [b["id"] for b in resp.json()["bills"]]
    assert ids and ids[0] == "hr1-118"
    assert "hr2-118" not in ids  # no lexical/semantic overlap


async def test_trigram_tolerates_typo(client, db, disable_embeddings):
    await _seed_corpus(db)
    # "Housng" misspelled — FTS misses, trigram on title rescues it.
    resp = await client.get("/api/bills", params={"q": "Housng"})
    ids = [b["id"] for b in resp.json()["bills"]]
    assert "hr3-118" in ids


async def test_semantic_leg_executes_and_fuses(client, db, stub_embedding):
    await _seed_corpus(db)
    # Give hr2 an embedding identical to the query vector -> cosine distance 0,
    # so semantic ranks it top even though the query word never appears in it.
    query_vec = [0.05] * 384
    stub_embedding(query_vec)
    await seed.add_embedding(db, bill_id="hr2-118", vector=query_vec)
    await seed.add_embedding(db, bill_id="hr1-118", vector=[-0.05] * 384)

    resp = await client.get("/api/bills", params={"q": "zzzznomatch"})
    assert resp.status_code == 200
    ids = [b["id"] for b in resp.json()["bills"]]
    assert "hr2-118" in ids  # pgvector + RRF fusion path exercised


async def test_status_filter_applies(client, db, disable_embeddings):
    await seed.add_bill(db, bill_id="hr9-118", title="Water Quality Act", status="Passed")
    await seed.add_bill(db, bill_id="hr8-118", title="Water Safety Act", status="Active")
    resp = await client.get("/api/bills", params={"q": "water", "status": "Passed"})
    ids = [b["id"] for b in resp.json()["bills"]]
    assert ids == ["hr9-118"]
