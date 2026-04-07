"""
Parses Senate vote XML from senate.gov.
Port of scripts/lib/parse-senate-vote-xml.ts
"""
import re
from dataclasses import dataclass, field


@dataclass
class SenateVoteMember:
    lis_member_id: str
    vote_cast: str
    party: str
    state: str


@dataclass
class SenateVoteSummary:
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
    members: list[SenateVoteMember] = field(default_factory=list)


def _extract_tag(xml: str, tag: str) -> str:
    m = re.search(rf"<{tag}[^>]*>([^<]*)</{tag}>", xml, re.IGNORECASE)
    return m.group(1).strip() if m else ""


def _extract_all_blocks(xml: str, tag: str) -> list[str]:
    return re.findall(rf"<{tag}[^>]*>[\s\S]*?</{tag}>", xml)


def parse_senate_vote_xml(xml: str) -> SenateVoteSummary:
    question = _extract_tag(xml, "vote_question_text") or _extract_tag(xml, "question")
    result = _extract_tag(xml, "vote_result")
    yea_total = int(_extract_tag(xml, "yeas") or 0)
    nay_total = int(_extract_tag(xml, "nays") or 0)
    present_total = int(_extract_tag(xml, "present") or 0)
    not_voting_total = int(_extract_tag(xml, "absent") or 0)

    yea_democrat = nay_democrat = 0
    yea_republican = nay_republican = 0
    yea_independent = nay_independent = 0

    for block in _extract_all_blocks(xml, "party_totals"):
        party = _extract_tag(block, "party_name").lower()
        yeas = int(_extract_tag(block, "yeas") or 0)
        nays = int(_extract_tag(block, "nays") or 0)
        if "democrat" in party:
            yea_democrat = yeas
            nay_democrat = nays
        elif "republican" in party:
            yea_republican = yeas
            nay_republican = nays
        else:
            yea_independent += yeas
            nay_independent += nays

    members: list[SenateVoteMember] = []
    for block in _extract_all_blocks(xml, "member"):
        lis_id = _extract_tag(block, "lis_member_id")
        vote_cast = _extract_tag(block, "vote_cast")
        if lis_id and vote_cast:
            members.append(SenateVoteMember(
                lis_member_id=lis_id,
                vote_cast=vote_cast,
                party=_extract_tag(block, "party"),
                state=_extract_tag(block, "state"),
            ))

    return SenateVoteSummary(
        question=question,
        result=result,
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
