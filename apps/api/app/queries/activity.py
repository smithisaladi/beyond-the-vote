"""Activity feed aggregation for the dashboard.

Merges recent votes by followed politicians and recent actions on tracked
bills into a single newest-first feed. SQL lives here (per the app/queries/
convention); the router only serializes the result.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_PASSAGE_VOTE_KEYWORDS = ("on passage", "on motion to", "veto")
_PASSAGE_ACTION_KEYWORDS = (
    "passed", "failed", "rejected", "became public law",
    "enacted", "vetoed", "agreed to",
)


def classify_alert(
    *,
    kind: str,
    question: str | None = None,
    action_text: str | None = None,
    status: str | None = None,
) -> bool:
    """High-signal events get visual emphasis. Votes: final-passage votes
    (by question text). Actions: passage / failure / enactment. Else routine."""
    if kind == "vote":
        haystack = (question or "").lower()
        return any(k in haystack for k in _PASSAGE_VOTE_KEYWORDS)
    if kind == "action":
        haystack = f"{action_text or ''} {status or ''}".lower()
        return any(k in haystack for k in _PASSAGE_ACTION_KEYWORDS)
    return False
