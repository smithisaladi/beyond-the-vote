# apps/api/app/schemas/donors.py
from pydantic import BaseModel
from app.schemas.common import PaginationMeta

class TopRecipient(BaseModel):
    bioguideId: str | None = None
    name: str | None = None
    party: str | None = None
    state: str | None = None
    chamber: str | None = None
    amount: float = 0

class ContributorEntry(BaseModel):
    cmteId: str
    rank: int | None = None
    cmteName: str
    directTotal: float = 0
    ieForTotal: float = 0
    ieAgainstTotal: float = 0
    totalContributions: float = 0
    recipientCount: int = 0
    topRecipients: list[TopRecipient] = []

class DonorListResponse(BaseModel):
    contributors: list[ContributorEntry]
    pagination: PaginationMeta
