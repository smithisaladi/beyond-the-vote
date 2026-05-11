from pipeline.enrich.industry_classification import (
    INDUSTRY_BUCKETS,
    build_classification_prompt,
    parse_classification_response,
    classify_employers_batch_local,
)


def test_industry_buckets_has_expected_count():
    assert len(INDUSTRY_BUCKETS) >= 15
    assert "Finance" in INDUSTRY_BUCKETS
    assert "Technology" in INDUSTRY_BUCKETS
    assert "Healthcare" in INDUSTRY_BUCKETS


def test_build_classification_prompt():
    prompt = build_classification_prompt(["Goldman Sachs", "Google LLC", "Pfizer Inc"])
    assert "Goldman Sachs" in prompt
    assert "Google LLC" in prompt
    assert "Finance" in prompt


def test_parse_classification_response():
    response = """Goldman Sachs|Finance|0.95
Google LLC|Technology|0.92
Pfizer Inc|Healthcare|0.88"""
    results = parse_classification_response(response)
    assert len(results) == 3
    assert results[0]["employer"] == "Goldman Sachs"
    assert results[0]["industry"] == "Finance"
    assert results[0]["confidence"] == 0.95


def test_parse_classification_response_handles_bad_lines():
    response = """Goldman Sachs|Finance|0.95
bad line without pipes
Google LLC|Technology|0.92"""
    results = parse_classification_response(response)
    assert len(results) == 2


def test_classify_employers_batch_local():
    employers = ["Goldman Sachs", "JPMorgan Chase", "Google LLC"]
    results = classify_employers_batch_local(employers)
    assert len(results) == 3
    for r in results:
        assert r["industry"] in INDUSTRY_BUCKETS
        assert 0 <= r["confidence"] <= 1
