from enrich.suspicious_clusters import _score_event


def test_score_event_high_suspicion():
    """Cluster of similar-amount, same-employer donors should score high."""
    donors = [
        {"name": f"DONOR{i}", "employer": "ACME CORP", "zip_code": "10001",
         "transaction_amt": "2800"}
        for i in range(10)
    ]
    score, signals = _score_event(donors)
    assert score > 0.5
    assert "same_day_cluster_size" in signals
    assert "shared_employer" in signals


def test_score_event_low_suspicion():
    """Two diverse donors should score low."""
    donors = [
        {"name": "ALICE", "employer": "GOOGLE", "zip_code": "94043", "transaction_amt": "100"},
        {"name": "BOB", "employer": "APPLE", "zip_code": "95014", "transaction_amt": "5000"},
    ]
    score, signals = _score_event(donors)
    assert score < 0.5  # Low for a pair of diverse donors


def test_score_event_empty():
    score, signals = _score_event([])
    assert score == 0.0
