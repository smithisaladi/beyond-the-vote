from load.legislators import transform_legislator, transform_committee_membership


SAMPLE_LEGISLATOR = {
    "id": {
        "bioguide": "S000148",
        "thomas": "01036",
        "lis": "S270",
        "govtrack": 300087,
        "fec": ["S0NY00188", "H6NY00043"],
        "icpsr": 14858,
    },
    "name": {
        "first": "Charles",
        "last": "Schumer",
        "official_full": "Charles E. Schumer",
    },
    "bio": {"birthday": "1950-11-23", "gender": "M"},
    "terms": [
        {
            "type": "sen",
            "start": "2023-01-03",
            "end": "2029-01-03",
            "state": "NY",
            "class": 3,
            "party": "Democrat",
            "url": "https://www.schumer.senate.gov",
            "phone": "202-224-6542",
            "address": "322 Hart Senate Office Building",
        }
    ],
}


def test_transform_legislator_basic():
    row = transform_legislator(SAMPLE_LEGISLATOR, in_office=True)
    assert row is not None
    assert row["bioguide_id"] == "S000148"
    assert row["full_name"] == "Charles E. Schumer"
    assert row["party"] == "Democrat"
    assert row["chamber"] == "Senate"
    assert row["state"] == "NY"
    assert row["state_full"] == "New York"
    assert row["fec_ids"] == ["S0NY00188", "H6NY00043"]
    assert row["in_office"] is True
    assert row["senate_class"] == 3


def test_transform_legislator_missing_bioguide_returns_none():
    record = {"id": {}, "name": {"first": "Test", "last": "User"}, "terms": []}
    assert transform_legislator(record, in_office=True) is None


def test_transform_legislator_no_terms_returns_none():
    record = {"id": {"bioguide": "X000001"}, "name": {"first": "Test", "last": "User"}, "terms": []}
    assert transform_legislator(record, in_office=True) is None


def test_transform_committee_membership():
    members = [
        {"bioguide": "S000148", "rank": 1, "title": "Chair"},
        {"bioguide": "M000355", "rank": 2, "title": "Ranking Member"},
    ]
    rows = transform_committee_membership("SSJU00", members)
    assert len(rows) == 2
    assert rows[0]["committee_id"] == "SSJU00"
    assert rows[0]["bioguide_id"] == "S000148"
    assert rows[0]["role"] == "Chair"
