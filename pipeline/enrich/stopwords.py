"""Employer stopword detection and normalization."""
import re

_NON_EMPLOYERS = {
    "retired", "self-employed", "self employed", "self", "not employed",
    "none", "n/a", "na", "homemaker", "student", "unemployed",
    "not applicable", "information requested", "information requested per best efforts",
    "refused", "disabled", "volunteer",
}


def is_non_employer(employer: str | None) -> bool:
    """Return True if the employer string is a non-employer (retired, self-employed, etc.)."""
    if not employer:
        return True
    normalized = employer.strip().lower()
    if not normalized:
        return True
    return normalized in _NON_EMPLOYERS


def normalize_employer_string(employer: str | None) -> str:
    """Lowercase, strip whitespace, collapse multiple spaces."""
    if not employer:
        return ""
    return re.sub(r"\s+", " ", employer.strip().lower())
