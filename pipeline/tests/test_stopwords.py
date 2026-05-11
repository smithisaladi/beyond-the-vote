from pipeline.enrich.stopwords import is_non_employer, normalize_employer_string


def test_retired_is_non_employer():
    assert is_non_employer("RETIRED") is True
    assert is_non_employer("retired") is True
    assert is_non_employer("Retired") is True


def test_self_employed_is_non_employer():
    assert is_non_employer("SELF-EMPLOYED") is True
    assert is_non_employer("SELF EMPLOYED") is True
    assert is_non_employer("Self") is True


def test_not_employed_is_non_employer():
    assert is_non_employer("NOT EMPLOYED") is True
    assert is_non_employer("N/A") is True
    assert is_non_employer("NONE") is True
    assert is_non_employer("") is True


def test_real_employer_is_not_non_employer():
    assert is_non_employer("Goldman Sachs") is False
    assert is_non_employer("Google LLC") is False
    assert is_non_employer("US Army") is False


def test_normalize_employer_string():
    assert normalize_employer_string("  GOLDMAN SACHS & CO.  ") == "goldman sachs & co."
    assert normalize_employer_string("Goldman  Sachs   Group") == "goldman sachs group"
    assert normalize_employer_string(None) == ""
    assert normalize_employer_string("") == ""
