from pipeline.load.scores import transform_member_score

def test_transform_member_score_valid():
    record = {"icpsr": 14858, "congress": 119, "nominate_dim1": -0.342, "nominate_dim2": 0.156}
    row = transform_member_score(record, icpsr_to_bioguide={"14858": "S000148"})
    assert row is not None
    assert row["bioguide_id"] == "S000148"
    assert row["nominate_dim1"] == -0.342

def test_transform_member_score_unknown_icpsr_returns_none():
    record = {"icpsr": 99999, "congress": 119, "nominate_dim1": 0.1, "nominate_dim2": 0.2}
    assert transform_member_score(record, icpsr_to_bioguide={}) is None
