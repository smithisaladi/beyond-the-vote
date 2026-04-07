"""
Fetches bill text XML from govinfo.gov.
Port of scripts/lib/fetch-bill-text.ts

Package ID format: BILLS-{congress}{type}{number}{version}
Example: BILLS-119s1247is (introduced version of S. 1247, 119th Congress)

Versions in priority order (most processed first):
  enr = enrolled (sent to President)
  es/eh = engrossed (passed a chamber)
  rs/rh = reported by committee
  is/ih = introduced
"""
import re
import httpx
from pipeline.lib.config import TIMEOUT_FAST

VERSION_PRIORITY = ["enr", "es", "eh", "rs", "rh", "is", "ih"]


def fetch_bill_text_xml(congress: int, bill_type: str, number: int | str) -> str | None:
    """Fetches bill XML, trying versions in priority order. Returns XML string or None."""
    for version in VERSION_PRIORITY:
        package_id = f"BILLS-{congress}{bill_type.lower()}{number}{version}"
        url = f"https://www.govinfo.gov/content/pkg/{package_id}/xml/{package_id}.xml"
        try:
            resp = httpx.get(url, timeout=TIMEOUT_FAST)
            if resp.status_code == 200:
                return resp.text
        except Exception:
            # Version doesn't exist or timed out — try next
            continue
    return None


def extract_text_from_bill_xml(xml: str) -> str:
    """Extracts plain text from bill XML for entity extraction."""
    body_match = re.search(
        r"<(?:legis-body|resolution-body)[^>]*>([\s\S]*?)</(?:legis-body|resolution-body)>",
        xml,
    )
    if not body_match:
        # Fall back to stripping all tags from the full document
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", xml)).strip()

    body = body_match.group(1)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", body)).strip()
