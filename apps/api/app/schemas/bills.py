# apps/api/app/schemas/bills.py
from pydantic import BaseModel

class BillSummary(BaseModel):
    id: str
    number: str | None = None
    title: str
    sponsor: str | None = None
    party: str | None = None
    status: str | None = None
    topics: list[str] = []
    lastAction: str | None = None
    summary: str | None = None

class SponsorDetail(BaseModel):
    name: str | None = None
    bioguideId: str | None = None
    party: str | None = None
    state: str | None = None
    district: str | None = None

class PartyBreakdown(BaseModel):
    yea: int = 0
    nay: int = 0

class VoteDetail(BaseModel):
    id: str
    date: str | None = None
    chamber: str
    question: str | None = None
    result: str
    yeas: int = 0
    nays: int = 0
    present: int = 0
    notVoting: int = 0
    partyBreakdown: dict[str, PartyBreakdown] = {}
    sourceUrl: str | None = None

class BillsByTopicResponse(BaseModel):
    slug: str
    bills: list[BillSummary]
    count: int
