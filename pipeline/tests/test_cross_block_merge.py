"""Tests for cross-block merge logic in enrich/donor_resolution.py."""
import pytest

from enrich.donor_resolution import (
    _normalize_name,
    _normalize_employer,
    _merge_cross_block_duplicates,
)


# ── _normalize_name tests ─────────────────────────────────────────────────────


class TestNormalizeName:
    def test_lowercases(self):
        assert _normalize_name("SMITH, JOHN") == "smith, john"

    def test_strips_jr_suffix(self):
        assert _normalize_name("JONES, ROBERT JR.") == "jones, robert"

    def test_strips_sr_suffix(self):
        assert _normalize_name("DOE, JAMES SR.") == "doe, james"

    def test_strips_iii_suffix(self):
        assert _normalize_name("WINDSOR, CHARLES III") == "windsor, charles"

    def test_strips_mr_suffix(self):
        assert _normalize_name("PATEL, RAJ MR.") == "patel, raj"

    def test_strips_mrs_suffix(self):
        assert _normalize_name("CHEN, LI MRS.") == "chen, li"

    def test_comma_handling(self):
        result = _normalize_name("  SMITH , JOHN  ")
        assert result == "smith , john"

    def test_no_suffix(self):
        assert _normalize_name("GARCIA, MARIA") == "garcia, maria"

    def test_empty_string(self):
        assert _normalize_name("") == ""

    def test_whitespace_only(self):
        assert _normalize_name("   ") == ""


# ── _normalize_employer tests ─────────────────────────────────────────────────


class TestNormalizeEmployer:
    def test_strips_inc_suffix(self):
        assert _normalize_employer("SPACEX INC") == "spacex"

    def test_strips_corp_suffix(self):
        assert _normalize_employer("MICROSOFT CORP") == "microsoft"

    def test_strips_llc_suffix(self):
        assert _normalize_employer("ACME LLC") == "acme"

    def test_strips_ltd_suffix(self):
        assert _normalize_employer("BARCLAYS LTD") == "barclays"

    def test_noise_retired(self):
        assert _normalize_employer("RETIRED") == ""

    def test_noise_self_employed(self):
        assert _normalize_employer("SELF-EMPLOYED") == ""

    def test_noise_na(self):
        assert _normalize_employer("N/A") == ""

    def test_empty_input(self):
        assert _normalize_employer("") == ""

    def test_none_like_empty(self):
        # empty string is falsy, returns ""
        assert _normalize_employer("") == ""

    def test_normal_employer_no_suffix(self):
        assert _normalize_employer("GOOGLE") == "google"

    def test_strips_inc_dot(self):
        assert _normalize_employer("APPLE INC.") == "apple"

    def test_noise_homemaker(self):
        assert _normalize_employer("HOMEMAKER") == ""

    def test_noise_student(self):
        assert _normalize_employer("STUDENT") == ""


# ── _merge_cross_block_duplicates tests ───────────────────────────────────────


def _make_donor(canonical_id, name, employer, total_amount, cmte_ids=None, state="NY"):
    return {
        "canonical_id": canonical_id,
        "display_name": name,
        "employer": employer,
        "city": "NEW YORK",
        "state": state,
        "zip5": "10001",
        "total_amount": total_amount,
        "contribution_count": 1,
        "cmte_ids": cmte_ids or ["C001"],
        "confidence": 0.85,
        "model_version": "test_v1",
    }


class TestMergeCrossBlockDuplicates:
    def test_same_name_same_employer_merge(self):
        donors = {
            "d_1": _make_donor("d_1", "SMITH, JOHN", "GOLDMAN SACHS", 5000, ["C001"]),
            "d_2": _make_donor("d_2", "SMITH, JOHN", "GOLDMAN SACHS", 3000, ["C002"]),
        }
        result = _merge_cross_block_duplicates(donors)
        assert len(result) == 1
        surviving = list(result.values())[0]
        assert surviving["total_amount"] == 8000

    def test_same_name_substring_employer_merge(self):
        """'SPACEX' is a substring of 'SPACEX INC' after normalization."""
        donors = {
            "d_1": _make_donor("d_1", "MUSK, ELON", "SPACEX", 50000, ["C001"]),
            "d_2": _make_donor("d_2", "MUSK, ELON", "SPACEX INC", 30000, ["C002"]),
        }
        result = _merge_cross_block_duplicates(donors)
        assert len(result) == 1
        surviving = list(result.values())[0]
        assert surviving["total_amount"] == 80000

    def test_same_name_different_employer_high_amount_merge(self):
        """Two donors with same name + different employers + combined >$100K -> merge."""
        donors = {
            "d_1": _make_donor("d_1", "GATES, BILL", "MICROSOFT", 60000, ["C001"]),
            "d_2": _make_donor("d_2", "GATES, BILL", "CASCADE INVESTMENTS", 50000, ["C002"]),
        }
        result = _merge_cross_block_duplicates(donors)
        assert len(result) == 1
        surviving = list(result.values())[0]
        assert surviving["total_amount"] == 110000

    def test_same_name_one_empty_employer_above_10k_merge(self):
        """One empty employer + combined >$10K -> merge."""
        donors = {
            "d_1": _make_donor("d_1", "DOE, JANE", "ACME CORP", 8000, ["C001"]),
            "d_2": _make_donor("d_2", "DOE, JANE", "RETIRED", 5000, ["C002"]),
        }
        result = _merge_cross_block_duplicates(donors)
        # "RETIRED" normalizes to "", so one empty employer. Combined = 13K > 10K
        assert len(result) == 1
        assert list(result.values())[0]["total_amount"] == 13000

    def test_same_name_different_employer_low_amount_no_merge(self):
        """Two donors same name + different employers + combined <$10K -> DON'T merge."""
        donors = {
            "d_1": _make_donor("d_1", "LEE, SAM", "GOOGLE", 3000, ["C001"]),
            "d_2": _make_donor("d_2", "LEE, SAM", "AMAZON", 4000, ["C002"]),
        }
        result = _merge_cross_block_duplicates(donors)
        assert len(result) == 2

    def test_merge_absorbs_amounts_and_cmte_ids(self):
        donors = {
            "d_1": _make_donor("d_1", "SMITH, JOHN", "GOLDMAN SACHS", 5000, ["C001"]),
            "d_2": _make_donor("d_2", "SMITH, JOHN", "GOLDMAN SACHS", 3000, ["C002"]),
        }
        result = _merge_cross_block_duplicates(donors)
        surviving = list(result.values())[0]
        assert surviving["total_amount"] == 8000
        assert surviving["contribution_count"] == 2
        assert set(surviving["cmte_ids"]) == {"C001", "C002"}

    def test_merge_picks_best_name(self):
        """Longer name variant (more complete) should be kept after merge."""
        donors = {
            "d_1": _make_donor("d_1", "SMITH, JOHN", "GOLDMAN SACHS", 8000, ["C001"]),
            "d_2": _make_donor("d_2", "SMITH, JOHN MR.", "GOLDMAN SACHS", 3000, ["C002"]),
        }
        # "SMITH, JOHN" and "SMITH, JOHN MR." both normalize to "smith, john"
        # The longer display_name "SMITH, JOHN MR." should be picked
        result = _merge_cross_block_duplicates(donors)
        surviving = list(result.values())[0]
        assert surviving["display_name"] == "SMITH, JOHN MR."

    def test_merge_sets_confidence_to_075(self):
        donors = {
            "d_1": _make_donor("d_1", "SMITH, JOHN", "GOLDMAN SACHS", 5000, ["C001"]),
            "d_2": _make_donor("d_2", "SMITH, JOHN", "GOLDMAN SACHS", 3000, ["C002"]),
        }
        result = _merge_cross_block_duplicates(donors)
        surviving = list(result.values())[0]
        assert surviving["confidence"] == 0.75

    def test_different_names_no_merge(self):
        donors = {
            "d_1": _make_donor("d_1", "SMITH, JOHN", "GOLDMAN SACHS", 5000),
            "d_2": _make_donor("d_2", "DOE, JANE", "GOLDMAN SACHS", 3000),
        }
        result = _merge_cross_block_duplicates(donors)
        assert len(result) == 2

    def test_empty_employer_below_10k_no_merge(self):
        """Both have empty employers, combined <$10K -> don't merge."""
        donors = {
            "d_1": _make_donor("d_1", "PARK, JIN", "RETIRED", 3000, ["C001"]),
            "d_2": _make_donor("d_2", "PARK, JIN", "N/A", 4000, ["C002"]),
        }
        result = _merge_cross_block_duplicates(donors)
        assert len(result) == 2
