"""
Bill status mapping and ID formatting utilities.
Port of lib/bills.ts
"""
from datetime import datetime, timezone

BILL_TYPE_LABELS: dict[str, str] = {
    "s":       "S.",
    "hr":      "H.R.",
    "sjres":   "S.J.Res.",
    "hjres":   "H.J.Res.",
    "sres":    "S.Res.",
    "hres":    "H.Res.",
    "sconres": "S.Con.Res.",
    "hconres": "H.Con.Res.",
}


def map_status(latest_action_text: str | None = None, introduced_date: str | None = None) -> str:
    action = (latest_action_text or "").lower()
    if any(s in action for s in [
        "became public law", "signed by president",
        "passed the senate", "passed the house", "presented to president",
    ]):
        return "Passed"
    if any(s in action for s in ["failed", "defeated", "vetoed", "rejected"]):
        return "Failed"
    if "referred to" in action or "committee" in action:
        if introduced_date:
            try:
                intro = datetime.fromisoformat(introduced_date.replace("Z", "+00:00"))
                months_ago = (datetime.now(timezone.utc) - intro).days / 30
                if months_ago > 6:
                    return "Stalled"
            except ValueError:
                pass
        return "Committee"
    return "Active"


def format_bill_id(bill_id: str) -> str:
    """
    "119-s-1247"    → "S. 1247"
    "119-hr-4521"   → "H.R. 4521"
    "119-sjres-12"  → "S.J.Res. 12"
    """
    parts = bill_id.split("-")
    if len(parts) < 3:
        return bill_id
    _, bill_type, number = parts[0], parts[1], parts[2]
    label = BILL_TYPE_LABELS.get(bill_type, bill_type.upper())
    return f"{label} {number}"
