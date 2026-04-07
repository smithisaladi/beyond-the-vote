"""
Extracts legal citations from bill text.
Port of scripts/lib/parse-citations.ts

Intentionally conservative — prefers false negatives over false positives
to keep referenced_laws arrays clean.
"""
import re
from dataclasses import dataclass, field

# "42 U.S.C. 7401", "42 U.S.C. § 7401", "42 USC 7401"
USC_PATTERN = re.compile(r"(\d+)\s*U\.?S\.?C\.?\s*§?\s*(\d+[a-z]?(?:[-\u2013]\d+[a-z]?)?)", re.IGNORECASE)

# "Clean Air Act", "Higher Education Act of 1965"
ACT_PATTERN = re.compile(r"(?:the\s+)?((?:[A-Z][a-zA-Z]*\s+){1,6}Act(?:\s+of\s+\d{4})?)")

# "Public Law 117-169", "P.L. 117-169"
PL_PATTERN = re.compile(r"(?:Public\s+Law|P\.?\s*L\.?)\s*(\d{1,3})[-\u2013](\d{1,4})", re.IGNORECASE)

ACT_BLOCKLIST = {
    "This Act", "That Act", "The Act", "An Act", "Such Act",
    "Any Act", "Each Act", "Every Act",
}


@dataclass
class BillCitations:
    usc_sections: list[str] = field(default_factory=list)  # ["42 USC 7401"]
    act_names: list[str] = field(default_factory=list)      # ["Clean Air Act"]
    public_laws: list[str] = field(default_factory=list)    # ["PL 117-169"]


def extract_citations(text: str) -> BillCitations:
    usc_sections: set[str] = set()
    act_names: set[str] = set()
    public_laws: set[str] = set()

    for m in USC_PATTERN.finditer(text):
        usc_sections.add(f"{m.group(1)} USC {m.group(2)}")

    for m in ACT_PATTERN.finditer(text):
        name = m.group(1).strip()
        if name not in ACT_BLOCKLIST and len(name.split()) >= 2:
            act_names.add(name)

    for m in PL_PATTERN.finditer(text):
        public_laws.add(f"PL {m.group(1)}-{m.group(2)}")

    return BillCitations(
        usc_sections=sorted(usc_sections),
        act_names=sorted(act_names),
        public_laws=sorted(public_laws),
    )
