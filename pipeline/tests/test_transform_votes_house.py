"""
Tests for transform.votes_house — house vote API responses → DB rows.
"""
import pytest
from transform.votes_house import make_vote_id, transform_vote_summary, transform_vote_positions


def _make_detail(**overrides):
    """Build a minimal congress.gov house vote detail response."""
    base = {
        "houseRollCallVote": {
            "rollCallNumber": 42,
            "startDate": "2025-03-15",
            "voteQuestion": "On Passage",
            "voteResult": "Passed",
            "legislationType": "hr",
            "legislationNumber": "1234",
            "legislationTitle": "Test Act",
            "requiredForPassage": "1/2",
            "sourceDataURL": "https://clerk.house.gov/vote/42",
            "votePartyTotal": [
                {"yeaTotal": 200, "nayTotal": 50, "presentTotal": 1, "notVotingTotal": 5},
                {"yeaTotal": 20, "nayTotal": 150, "presentTotal": 0, "notVotingTotal": 9},
            ],
        }
    }
    vote = base["houseRollCallVote"]
    vote.update(overrides)
    return base


class TestMakeVoteId:
    def test_basic(self):
        assert make_vote_id(119, 42) == "house-119-42"

    def test_string_roll_call(self):
        assert make_vote_id(119, "7") == "house-119-7"


class TestTransformVoteSummary:
    def test_basic_vote(self):
        row = transform_vote_summary(_make_detail(), congress=119)
        assert row is not None
        assert row["id"] == "house-119-42"
        assert row["bill_id"] == "119-hr-1234"
        assert row["chamber"] == "House"
        assert row["congress"] == 119
        assert row["date"] == "2025-03-15"
        assert row["result"] == "Passed"
        assert row["yea_total"] == 220
        assert row["nay_total"] == 200
        assert row["present_total"] == 1
        assert row["not_voting_total"] == 14

    def test_returns_none_when_roll_call_missing(self):
        detail = _make_detail()
        del detail["houseRollCallVote"]["rollCallNumber"]
        assert transform_vote_summary(detail, congress=119) is None

    def test_returns_none_for_empty_detail(self):
        assert transform_vote_summary({}, congress=119) is None
        assert transform_vote_summary(None, congress=119) is None

    def test_title_fallback_to_question(self):
        detail = _make_detail()
        del detail["houseRollCallVote"]["legislationTitle"]
        row = transform_vote_summary(detail, congress=119)
        assert row["title"] == "On Passage"

    def test_source_url(self):
        row = transform_vote_summary(_make_detail(), congress=119)
        assert row["source_url"] == "https://clerk.house.gov/vote/42"


class TestTransformVotePositions:
    def test_position_normalization(self):
        members_data = {
            "houseRollCallVoteMemberVotes": {
                "results": [
                    {"bioguideID": "A000001", "voteCast": "Aye"},
                    {"bioguideID": "B000002", "voteCast": "No"},
                    {"bioguideID": "C000003", "voteCast": "Present"},
                    {"bioguideID": "D000004", "voteCast": "Not Voting"},
                ],
            }
        }
        positions = transform_vote_positions(members_data, "house-119-42")
        by_id = {p["bioguide_id"]: p["position"] for p in positions}
        assert by_id["A000001"] == "Yea"
        assert by_id["B000002"] == "Nay"
        assert by_id["C000003"] == "Present"
        assert by_id["D000004"] == "Not Voting"

    def test_bioguide_id_extraction(self):
        """Handles both bioguideID and bioguideId keys."""
        members_data = {
            "houseRollCallVoteMemberVotes": {
                "results": [
                    {"bioguideID": "A000001", "voteCast": "Yea"},
                    {"bioguideId": "B000002", "voteCast": "Nay"},
                ],
            }
        }
        positions = transform_vote_positions(members_data, "house-119-42")
        ids = {p["bioguide_id"] for p in positions}
        assert ids == {"A000001", "B000002"}

    def test_empty_members_data(self):
        assert transform_vote_positions(None, "house-119-42") == []
        assert transform_vote_positions({}, "house-119-42") == []

    def test_list_input(self):
        members_data = [
            {"bioguideID": "A000001", "voteCast": "Yea"},
        ]
        positions = transform_vote_positions(members_data, "house-119-42")
        assert len(positions) == 1
        assert positions[0]["bioguide_id"] == "A000001"
