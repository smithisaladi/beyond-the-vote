from pipeline.load.bills import transform_bill, make_bill_id


def test_make_bill_id():
    assert make_bill_id(119, "hr", 4521) == "119-hr-4521"
    assert make_bill_id(118, "s", 1247) == "118-s-1247"


SAMPLE_BILL_JSON = {
    "bill_id": "hr4521-119",
    "bill_type": "hr",
    "number": 4521,
    "congress": 119,
    "introduced_at": "2025-03-15",
    "official_title": "To establish a clean energy program.",
    "short_title": "Clean Energy Act",
    "summary": {
        "text": "This bill establishes a program for clean energy development.",
        "date": "2025-03-15",
    },
    "sponsor": {
        "bioguide_id": "P000197",
        "name": "Nancy Pelosi",
        "party": "D",
        "state": "CA",
    },
    "status": "REFERRED",
    "status_at": "2025-03-15",
    "subjects_top_term": "Energy",
    "subjects": ["Energy", "Environmental protection"],
    "actions": [
        {
            "acted_at": "2025-03-15",
            "text": "Referred to the Committee on Energy and Commerce.",
            "type": "referral",
        }
    ],
    "history": {
        "active": False,
        "awaiting_signature": False,
        "enacted": False,
        "vetoed": False,
    },
}


def test_transform_bill_basic():
    row = transform_bill(SAMPLE_BILL_JSON)
    assert row is not None
    assert row["bill_id"] == "119-hr-4521"
    assert row["bill_number"] == "H.R. 4521"
    assert row["congress"] == 119
    assert row["title"] == "Clean Energy Act"
    assert row["sponsor_bioguide_id"] == "P000197"
    assert row["status"] == "Committee"
    assert "climate-environment" in row["topics"]


def test_transform_bill_missing_congress_returns_none():
    bad = {**SAMPLE_BILL_JSON, "congress": None}
    assert transform_bill(bad) is None


def test_transform_bill_missing_number_returns_none():
    bad = {**SAMPLE_BILL_JSON, "number": None}
    assert transform_bill(bad) is None
