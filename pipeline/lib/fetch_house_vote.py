"""
Congress.gov House Roll Call API client.
Port of scripts/lib/fetch-house-vote.ts
"""
import httpx
from dataclasses import dataclass, field
from pipeline.lib.config import CONGRESS_BASE, TIMEOUT_SHORT, PAGE_SIZE_HOUSE_MEMBERS


@dataclass
class HouseVoteMember:
    bioguide_id: str
    name: str
    party: str
    state: str
    position: str  # "Yea" | "Nay" | "Not Voting" | "Present"


@dataclass
class HouseVoteSummary:
    question: str
    result: str
    yea_total: int
    nay_total: int
    present_total: int
    not_voting_total: int
    yea_democrat: int
    nay_democrat: int
    yea_republican: int
    nay_republican: int
    yea_independent: int
    nay_independent: int
    members: list[HouseVoteMember] = field(default_factory=list)


def _normalise_position(raw: str) -> str:
    r = raw.lower()
    if r in ("yea", "aye"):
        return "Yea"
    if r in ("nay", "no"):
        return "Nay"
    if r == "present":
        return "Present"
    return "Not Voting"


def fetch_house_vote(
    congress: int,
    roll_number: int,
    api_key: str,
    session: int = 1,
) -> HouseVoteSummary | None:
    base = f"{CONGRESS_BASE}/house-vote/{congress}/{session}/{roll_number}"

    try:
        resp = httpx.get(f"{base}?format=json&api_key={api_key}", timeout=TIMEOUT_SHORT)
        if not resp.is_success:
            return None
        data = resp.json()
    except Exception:
        return None

    vote = data.get("houseRollCallVote")
    if not vote:
        return None

    try:
        members_resp = httpx.get(
            f"{base}/members?format=json&limit={PAGE_SIZE_HOUSE_MEMBERS}&api_key={api_key}", timeout=TIMEOUT_SHORT
        )
        if not members_resp.is_success:
            return None
        members_data = members_resp.json()
    except Exception:
        return None

    raw_members: list[dict] = members_data.get("houseRollCallVoteMemberVotes", {}).get("results", [])

    members: list[HouseVoteMember] = []
    for m in raw_members:
        if not m.get("bioguideID"):
            continue
        members.append(HouseVoteMember(
            bioguide_id=m["bioguideID"],
            name=f"{m.get('firstName', '')} {m.get('lastName', '')}".strip(),
            party=m.get("voteParty", ""),
            state=m.get("voteState", ""),
            position=_normalise_position(m.get("voteCast", "")),
        ))

    yea_total = nay_total = present_total = not_voting_total = 0
    yea_democrat = nay_democrat = 0
    yea_republican = nay_republican = 0
    yea_independent = nay_independent = 0

    for m in members:
        party = m.party.upper()
        is_dem = party == "D"
        is_rep = party == "R"

        if m.position == "Yea":
            yea_total += 1
            if is_dem:
                yea_democrat += 1
            elif is_rep:
                yea_republican += 1
            else:
                yea_independent += 1
        elif m.position == "Nay":
            nay_total += 1
            if is_dem:
                nay_democrat += 1
            elif is_rep:
                nay_republican += 1
            else:
                nay_independent += 1
        elif m.position == "Present":
            present_total += 1
        else:
            not_voting_total += 1

    return HouseVoteSummary(
        question=vote.get("voteQuestion") or vote.get("question") or "",
        result=vote.get("result", ""),
        yea_total=yea_total,
        nay_total=nay_total,
        present_total=present_total,
        not_voting_total=not_voting_total,
        yea_democrat=yea_democrat,
        nay_democrat=nay_democrat,
        yea_republican=yea_republican,
        nay_republican=nay_republican,
        yea_independent=yea_independent,
        nay_independent=nay_independent,
        members=members,
    )
