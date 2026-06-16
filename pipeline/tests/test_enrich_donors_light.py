"""Tests for scripts.enrich_donors_light.exact_match_dedup."""
import pytest

from scripts.enrich_donors_light import exact_match_dedup


def _make_donor(
    name: str,
    employer: str,
    zip5: str,
    amount: float,
    cmte_id: str = "C00000001",
    sub_id: int = 1,
) -> dict:
    return {
        "sub_id": sub_id,
        "name": name,
        "employer": employer,
        "zip5": zip5,
        "amount": amount,
        "cmte_id": cmte_id,
    }


class TestExactMatchDedup:
    def test_groups_identical_donors(self):
        """Two contributions with identical name/employer/zip are merged into one canonical."""
        donors = [
            _make_donor("SMITH, JOHN", "ACME CORP", "10001", 500.0, "C00000001", sub_id=100),
            _make_donor("SMITH, JOHN", "ACME CORP", "10001", 300.0, "C00000002", sub_id=200),
        ]
        result = exact_match_dedup(donors)
        assert len(result) == 1
        assert result[0]["total_amount"] == 800.0

    def test_does_not_merge_different_employers(self):
        """Donors with the same name/zip but different employers stay separate."""
        donors = [
            _make_donor("JONES, ALICE", "FIRM A", "90210", 500.0, sub_id=1),
            _make_donor("JONES, ALICE", "FIRM B", "90210", 500.0, sub_id=2),
        ]
        result = exact_match_dedup(donors)
        assert len(result) == 2

    def test_aggregates_amounts(self):
        """total_amount is the sum of all member amounts."""
        donors = [
            _make_donor("LEE, BOB", "TECH INC", "94105", 100.0, sub_id=10),
            _make_donor("LEE, BOB", "TECH INC", "94105", 150.0, sub_id=20),
            _make_donor("LEE, BOB", "TECH INC", "94105", 75.0, sub_id=30),
        ]
        result = exact_match_dedup(donors)
        assert len(result) == 1
        assert result[0]["total_amount"] == 325.0

    def test_aggregates_contribution_count(self):
        """contribution_count equals the number of raw contributions in the group."""
        donors = [
            _make_donor("WANG, MEI", "HOSPITAL", "60601", 200.0, sub_id=1),
            _make_donor("WANG, MEI", "HOSPITAL", "60601", 200.0, sub_id=2),
            _make_donor("WANG, MEI", "HOSPITAL", "60601", 200.0, sub_id=3),
        ]
        result = exact_match_dedup(donors)
        assert len(result) == 1
        assert result[0]["contribution_count"] == 3

    def test_deduplicates_cmte_ids(self):
        """cmte_ids contains unique, sorted committee IDs across the group."""
        donors = [
            _make_donor("BROWN, SAM", "LAW LLC", "30301", 300.0, cmte_id="C00000003", sub_id=1),
            _make_donor("BROWN, SAM", "LAW LLC", "30301", 300.0, cmte_id="C00000003", sub_id=2),
            _make_donor("BROWN, SAM", "LAW LLC", "30301", 300.0, cmte_id="C00000001", sub_id=3),
        ]
        result = exact_match_dedup(donors)
        assert len(result) == 1
        assert result[0]["cmte_ids"] == ["C00000001", "C00000003"]

    def test_skips_below_200_threshold(self):
        """Groups whose total_amount < 200 are excluded from output."""
        donors = [
            _make_donor("PATEL, RAJ", "STARTUP", "10001", 100.0, sub_id=1),
            _make_donor("PATEL, RAJ", "STARTUP", "10001", 50.0, sub_id=2),
        ]
        result = exact_match_dedup(donors)
        assert len(result) == 0

    def test_includes_at_exactly_200_threshold(self):
        """A group with total_amount == 200 is included."""
        donors = [
            _make_donor("KIM, GRACE", "BANK", "10001", 200.0, sub_id=5),
        ]
        result = exact_match_dedup(donors)
        assert len(result) == 1

    def test_uses_longest_name_as_display_name(self):
        """Within a matched group, display_name is from the member with the longest name string.

        When multiple rows share the same (name_lower, employer_lower, zip5) key but have
        different raw name strings (e.g. mixed case vs all-caps of different byte lengths),
        the raw name with the most characters is chosen as display_name.
        """
        # Build donors where lowercased key is identical ("smith, john" / "acme corp")
        # but the raw name strings differ in length.
        short_name = "Smith, John"           # 11 chars
        long_name  = "SMITH, JOHN Q"         # 13 chars — same lowercase key won't match
        # Use a workaround: same lowercase key requires same stripped-lower name.
        # "SMITH, JOHN Q".strip().lower() != "smith, john".strip().lower()
        # So we test via mixed-case variants that share a lowercase key:
        # "SMITH, JOHN" (11) vs "smith, john " (12 with trailing space)
        donors = [
            _make_donor("SMITH, JOHN", "ACME CORP", "10001", 300.0, sub_id=1),
            _make_donor("SMITH, JOHN ", "ACME CORP", "10001", 300.0, sub_id=2),  # 12 chars
        ]
        result = exact_match_dedup(donors)
        assert len(result) == 1
        # The 12-char variant wins
        assert result[0]["display_name"] == "SMITH, JOHN "

    def test_canonical_id_uses_min_sub_id(self):
        """canonical_id is 'exact-{min_sub_id}' using the lowest sub_id in the group."""
        donors = [
            _make_donor("TAYLOR, ANN", "RETAIL CO", "20001", 300.0, sub_id=500),
            _make_donor("TAYLOR, ANN", "RETAIL CO", "20001", 300.0, sub_id=100),
            _make_donor("TAYLOR, ANN", "RETAIL CO", "20001", 300.0, sub_id=250),
        ]
        result = exact_match_dedup(donors)
        assert len(result) == 1
        assert result[0]["canonical_id"] == "exact-100"

    def test_sets_confidence_and_model_version(self):
        """confidence is 0.7 and model_version is 'exact-match-v1' (which encodes the
        exact-match resolution method — no separate resolution_method column exists)."""
        donors = [_make_donor("WHITE, TOM", "OIL CO", "77002", 500.0, sub_id=1)]
        result = exact_match_dedup(donors)
        assert len(result) == 1
        assert result[0]["confidence"] == 0.7
        assert result[0]["model_version"] == "exact-match-v1"

    def test_emits_only_donor_canonical_columns(self):
        """Guards the upsert: every emitted key must be a real donor_canonical column.

        A stray key (e.g. resolution_method) makes upsert() build an INSERT against a
        nonexistent column and the run fails at write time."""
        donors = [_make_donor("WHITE, TOM", "OIL CO", "77002", 500.0, sub_id=1)]
        result = exact_match_dedup(donors)
        donor_canonical_columns = {
            "canonical_id", "display_name", "employer", "city", "state", "zip5",
            "total_amount", "contribution_count", "cmte_ids", "confidence",
            "model_version", "created_at",
        }
        assert set(result[0]) <= donor_canonical_columns

    def test_empty_input(self):
        """Returns empty list for empty input."""
        assert exact_match_dedup([]) == []

    def test_distinct_donors_stay_separate(self):
        """Donors with different zip codes are not merged."""
        donors = [
            _make_donor("CLARK, EMILY", "PHARMA INC", "10001", 500.0, sub_id=1),
            _make_donor("CLARK, EMILY", "PHARMA INC", "20001", 500.0, sub_id=2),
        ]
        result = exact_match_dedup(donors)
        assert len(result) == 2

    def test_case_insensitive_matching(self):
        """Name and employer matching is case-insensitive."""
        donors = [
            _make_donor("SMITH, JOHN", "ACME CORP", "10001", 300.0, sub_id=1),
            _make_donor("smith, john", "acme corp", "10001", 300.0, sub_id=2),
        ]
        result = exact_match_dedup(donors)
        assert len(result) == 1
        assert result[0]["contribution_count"] == 2

    def test_zip_truncated_to_5_chars(self):
        """zip5 values longer than 5 characters are treated as zip5 for grouping."""
        donors = [
            _make_donor("ADAMS, LISA", "FINANCE", "100011234", 300.0, sub_id=1),
            _make_donor("ADAMS, LISA", "FINANCE", "10001", 300.0, sub_id=2),
        ]
        result = exact_match_dedup(donors)
        # Both truncate to "10001" → same group
        assert len(result) == 1
        assert result[0]["total_amount"] == 600.0
