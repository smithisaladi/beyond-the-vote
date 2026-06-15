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


def _parse_ts(value) -> int:
    """Best-effort epoch-ms from a date/datetime/ISO string; 0 on failure."""
    if value is None:
        return 0
    if isinstance(value, datetime):
        dt = value
    else:
        s = str(value).strip().replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(s)
        except ValueError:
            try:
                dt = datetime.fromisoformat(s[:10])  # date-only prefix
            except ValueError:
                return 0
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def _display_date(ts: int) -> str:
    if ts == 0:
        return ""
    return datetime.fromtimestamp(ts / 1000, tz=timezone.utc).strftime("%b %d, %Y")


def _map_vote_row(r: dict) -> dict:
    ts = _parse_ts(r.get("vote_date"))
    position = (r.get("position") or "").title()
    bill_id = r.get("bill_id")
    return {
        "id": f"vote-{r['vote_id']}-{r['bioguide_id']}",
        "politician": r.get("full_name"),
        "action": f"voted {position}".strip(),
        "subject": r.get("bill_title") or r.get("question") or "Cast a vote",
        "date": _display_date(ts),
        "timestamp": ts,
        "href": f"/bills/{bill_id}" if bill_id else None,
        "isAlert": classify_alert(kind="vote", question=r.get("question")),
    }


def _map_action_row(r: dict) -> dict:
    ts = _parse_ts(r.get("acted_at"))
    number = r.get("bill_number")
    title = r.get("bill_title")
    if number and title:
        subject = f"{number} — {title}"
    else:
        subject = title or number or r.get("bill_id") or "Bill update"
    bill_id = r.get("bill_id")
    return {
        "id": f"action-{r['action_id']}",
        "politician": None,
        "action": r.get("action_text") or "Action recorded",
        "subject": subject,
        "date": _display_date(ts),
        "timestamp": ts,
        "href": f"/bills/{bill_id}" if bill_id else None,
        "isAlert": classify_alert(
            kind="action", action_text=r.get("action_text"), status=r.get("status")
        ),
    }


_VOTES_SQL = text("""
    SELECT vp.vote_id, vp.bioguide_id, l.full_name, vp.position,
           vs.date AS vote_date, vs.question, vs.bill_id, b.title AS bill_title
    FROM congress.bill_vote_positions vp
    JOIN congress.bill_vote_summaries vs ON vs.id = vp.vote_id
    JOIN congress.legislators l ON l.bioguide_id = vp.bioguide_id
    LEFT JOIN congress.bills b ON b.bill_id = vs.bill_id
    WHERE vp.bioguide_id IN (
        SELECT politician_id FROM app.followed_politicians WHERE user_id = :uid
    )
    ORDER BY vs.date DESC
    LIMIT :limit
""")

_ACTIONS_SQL = text("""
    SELECT a.id AS action_id, a.bill_id, a.acted_at, a.text AS action_text,
           b.bill_number, b.title AS bill_title, b.status
    FROM congress.bill_actions a
    LEFT JOIN congress.bills b ON b.bill_id = a.bill_id
    WHERE a.bill_id IN (
        SELECT bill_id FROM app.tracked_bills WHERE user_id = :uid
    )
    ORDER BY a.acted_at DESC
    LIMIT :limit
""")


async def fetch_activity(db: AsyncSession, user_id: str, limit: int = 30) -> list[dict]:
    """Recent followed-politician votes + tracked-bill actions, newest first."""
    votes_res = await db.execute(_VOTES_SQL, {"uid": user_id, "limit": limit})
    items = [_map_vote_row(r) for r in votes_res.mappings().all()]

    actions_res = await db.execute(_ACTIONS_SQL, {"uid": user_id, "limit": limit})
    items += [_map_action_row(r) for r in actions_res.mappings().all()]

    items.sort(key=lambda it: it["timestamp"], reverse=True)
    return items[:limit]
