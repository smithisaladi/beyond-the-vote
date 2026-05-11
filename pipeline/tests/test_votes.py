from pipeline.load.votes import transform_vote, transform_positions

SAMPLE_VOTE_JSON = {
    "vote_id": "h123-119.2025",
    "chamber": "h",
    "congress": 119,
    "session": "2025",
    "number": 123,
    "date": "2025-04-15T14:30:00-04:00",
    "type": "On Passage",
    "question": "On Passage - H.R. 4521",
    "result": "Passed",
    "result_text": "Passed",
    "requires": "1/2",
    "bill": {"bill_id": "hr4521-119", "type": "hr", "number": 4521, "congress": 119},
    "votes": {
        "Yea": [
            {"id": "P000197", "display_name": "Pelosi", "party": "D", "state": "CA"},
            {"id": "S000148", "display_name": "Schumer", "party": "D", "state": "NY"},
        ],
        "Nay": [{"id": "M000355", "display_name": "McConnell", "party": "R", "state": "KY"}],
        "Not Voting": [],
        "Present": [],
    },
}

def test_transform_vote_summary():
    summary = transform_vote(SAMPLE_VOTE_JSON)
    assert summary is not None
    assert summary["id"] == "house-119-123"
    assert summary["bill_id"] == "119-hr-4521"
    assert summary["congress"] == 119
    assert summary["chamber"] == "House"
    assert summary["result"] == "Passed"
    assert summary["yea_total"] == 2
    assert summary["nay_total"] == 1

def test_transform_positions():
    positions = transform_positions(SAMPLE_VOTE_JSON, "house-119-123")
    assert len(positions) == 3
    yeas = [p for p in positions if p["position"] == "Yea"]
    nays = [p for p in positions if p["position"] == "Nay"]
    assert len(yeas) == 2
    assert len(nays) == 1
    assert yeas[0]["bioguide_id"] == "P000197"

def test_transform_vote_missing_number_returns_none():
    bad = {**SAMPLE_VOTE_JSON, "number": None}
    assert transform_vote(bad) is None
