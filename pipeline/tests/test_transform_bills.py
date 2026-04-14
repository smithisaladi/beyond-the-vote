"""
Tests for transform.bills — pure transformation of congress.gov API responses
into bills DB rows.
"""
import pytest
from transform.bills import make_bill_id, transform_bill, _format_bill_number, _congress_ordinal, _build_congress_gov_url


class TestMakeBillId:
    def test_basic(self):
        assert make_bill_id(119, "hr", 1234) == "119-hr-1234"

    def test_lowercases_type(self):
        assert make_bill_id(118, "S", 42) == "118-s-42"

    def test_string_number(self):
        assert make_bill_id(119, "sjres", "12") == "119-sjres-12"


class TestFormatBillNumber:
    @pytest.mark.parametrize("bill_type,number,expected", [
        ("s",       1247,  "S. 1247"),
        ("hr",      4521,  "H.R. 4521"),
        ("sjres",   12,    "S.J.Res. 12"),
        ("hjres",   99,    "H.J.Res. 99"),
        ("sres",    100,   "S.Res. 100"),
        ("hres",    200,   "H.Res. 200"),
        ("sconres", 10,    "S.Con.Res. 10"),
        ("hconres", 5,     "H.Con.Res. 5"),
    ])
    def test_known_types(self, bill_type, number, expected):
        assert _format_bill_number(bill_type, number) == expected

    def test_unknown_type_uppercases(self):
        assert _format_bill_number("xyz", 42) == "XYZ 42"


class TestCongressOrdinal:
    def test_regular(self):
        assert _congress_ordinal(119) == "119th"

    def test_first(self):
        assert _congress_ordinal(101) == "101st"

    def test_second(self):
        assert _congress_ordinal(102) == "102nd"

    def test_third(self):
        assert _congress_ordinal(103) == "103rd"

    def test_eleventh(self):
        # Special case: 11th, 12th, 13th always use "th"
        assert _congress_ordinal(111) == "111th"
        assert _congress_ordinal(112) == "112th"
        assert _congress_ordinal(113) == "113th"


class TestBuildCongressGovUrl:
    def test_house_bill(self):
        url = _build_congress_gov_url(119, "hr", "1234")
        assert url == "https://www.congress.gov/bill/119th-congress/house-bill/1234"

    def test_senate_bill(self):
        url = _build_congress_gov_url(118, "s", "42")
        assert url == "https://www.congress.gov/bill/118th-congress/senate-bill/42"


class TestTransformBill:
    def _make_detail(self, **overrides):
        base = {
            "congress": 119,
            "type": "hr",
            "number": 1234,
            "title": "Test Bill",
            "introducedDate": "2025-01-15",
            "latestAction": {"text": "Introduced.", "actionDate": "2025-01-15"},
            "policyArea": {"name": "Health"},
            "sponsors": [{"bioguideId": "D000001", "fullName": "Jane Doe", "party": "D"}],
        }
        base.update(overrides)
        return base

    def test_basic_transform(self):
        row = transform_bill(self._make_detail())
        assert row is not None
        assert row["bill_id"] == "119-hr-1234"
        assert row["bill_number"] == "H.R. 1234"
        assert row["congress"] == 119
        assert row["title"] == "Test Bill"
        assert row["policy_area"] == "Health"

    def test_returns_none_for_empty_detail(self):
        assert transform_bill({}) is None
        assert transform_bill(None) is None

    def test_returns_none_for_missing_required_fields(self):
        assert transform_bill({"title": "No IDs"}) is None

    def test_extracts_sponsor(self):
        row = transform_bill(self._make_detail())
        assert row["sponsor_name"] is not None
        assert row["sponsor_bioguide_id"] is not None

    def test_handles_missing_summary(self):
        row = transform_bill(self._make_detail())
        assert row["summary"] is None  # no _summary_text in detail

    def test_handles_embedded_summary(self):
        detail = self._make_detail()
        detail["_summary_text"] = "This bill does something."
        row = transform_bill(detail)
        assert row["summary"] == "This bill does something."

    def test_topics_derived(self):
        row = transform_bill(self._make_detail())
        assert isinstance(row["topics"], list)

    def test_congress_gov_url_constructed(self):
        row = transform_bill(self._make_detail())
        assert "congress.gov/bill/" in row["congress_gov_url"]
