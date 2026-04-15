"""
Tests for transform.votes_senate — senate XML roll call votes → DB rows.
"""
import pytest
from transform.votes_senate import make_vote_id, parse_vote_xml, resolve_bioguide_ids


def _make_xml(
    vote_number="15",
    date="January 15, 2025",
    question="On the Motion",
    result="Motion Agreed to",
    title="Test Motion",
    yeas="55",
    nays="40",
    present="1",
    absent="4",
    doc_type="S.",
    doc_number="100",
    members_xml="",
):
    """Build minimal senate.gov roll call XML bytes."""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<roll_call_vote>
  <congress_vote_number>{vote_number}</congress_vote_number>
  <vote_date>{date}</vote_date>
  <vote_question_text>{question}</vote_question_text>
  <vote_result>{result}</vote_result>
  <vote_title>{title}</vote_title>
  <majority_requirement>1/2</majority_requirement>
  <count>
    <yeas>{yeas}</yeas>
    <nays>{nays}</nays>
    <present>{present}</present>
    <absent>{absent}</absent>
  </count>
  <document>
    <document_type>{doc_type}</document_type>
    <document_number>{doc_number}</document_number>
  </document>
  <members>
    {members_xml}
  </members>
</roll_call_vote>""".encode("utf-8")


class TestMakeVoteId:
    def test_basic(self):
        assert make_vote_id(119, 15) == "senate-119-15"

    def test_string_roll_call(self):
        assert make_vote_id(119, "3") == "senate-119-3"


class TestParseVoteXml:
    def test_basic_summary(self):
        xml = _make_xml()
        summary, positions = parse_vote_xml(xml, congress=119)
        assert summary is not None
        assert summary["id"] == "senate-119-15"
        assert summary["chamber"] == "Senate"
        assert summary["result"] == "Motion Agreed to"
        assert summary["yea_total"] == 55
        assert summary["nay_total"] == 40
        assert summary["present_total"] == 1
        assert summary["not_voting_total"] == 4

    def test_extracts_bill_id(self):
        xml = _make_xml(doc_type="S.", doc_number="100")
        summary, _ = parse_vote_xml(xml, congress=119)
        assert summary["bill_id"] == "119-s-100"

    def test_hr_bill_id(self):
        xml = _make_xml(doc_type="H.R.", doc_number="456")
        summary, _ = parse_vote_xml(xml, congress=119)
        assert summary["bill_id"] == "119-hr-456"

    def test_returns_none_for_invalid_xml(self):
        summary, positions = parse_vote_xml(b"not xml at all <<<", congress=119)
        assert summary is None
        assert positions == []

    def test_returns_none_for_missing_vote_number(self):
        xml = b"""<?xml version="1.0" encoding="UTF-8"?>
<roll_call_vote>
  <vote_date>January 15, 2025</vote_date>
</roll_call_vote>"""
        summary, positions = parse_vote_xml(xml, congress=119)
        assert summary is None
        assert positions == []

    def test_date_parsing(self):
        xml = _make_xml(date="March 5, 2025")
        summary, _ = parse_vote_xml(xml, congress=119)
        assert summary["date"] == "2025-03-05"

    def test_member_positions_extracted(self):
        members = """
        <member>
          <last_name>Smith</last_name>
          <state>CA</state>
          <lis_member_id>S123</lis_member_id>
          <vote_cast>Yea</vote_cast>
        </member>
        <member>
          <last_name>Jones</last_name>
          <state>TX</state>
          <lis_member_id>S456</lis_member_id>
          <vote_cast>Nay</vote_cast>
        </member>
        """
        xml = _make_xml(members_xml=members)
        _, positions = parse_vote_xml(xml, congress=119)
        assert len(positions) == 2
        assert positions[0]["position"] == "Yea"
        assert positions[1]["position"] == "Nay"


class TestResolveBioguideIds:
    def test_lis_map_lookup(self):
        raw = [
            {"vote_id": "senate-119-15", "lis_member_id": "S123",
             "last_name": "smith", "state": "CA", "position": "Yea"},
        ]
        lis_map = {"S123": "B000001"}
        resolved = resolve_bioguide_ids(raw, lis_map, {})
        assert len(resolved) == 1
        assert resolved[0]["bioguide_id"] == "B000001"
        assert resolved[0]["position"] == "Yea"

    def test_name_state_fallback(self):
        raw = [
            {"vote_id": "senate-119-15", "lis_member_id": "",
             "last_name": "jones", "state": "TX", "position": "Nay"},
        ]
        name_map = {("jones", "TX"): "J000001"}
        resolved = resolve_bioguide_ids(raw, {}, name_map)
        assert len(resolved) == 1
        assert resolved[0]["bioguide_id"] == "J000001"

    def test_unresolved_excluded(self):
        raw = [
            {"vote_id": "senate-119-15", "lis_member_id": "UNKNOWN",
             "last_name": "nobody", "state": "ZZ", "position": "Yea"},
        ]
        resolved = resolve_bioguide_ids(raw, {}, {})
        assert len(resolved) == 0

    def test_lis_preferred_over_name(self):
        raw = [
            {"vote_id": "senate-119-15", "lis_member_id": "S123",
             "last_name": "smith", "state": "CA", "position": "Yea"},
        ]
        lis_map = {"S123": "B000001"}
        name_map = {("smith", "CA"): "B000002"}
        resolved = resolve_bioguide_ids(raw, lis_map, name_map)
        assert resolved[0]["bioguide_id"] == "B000001"
