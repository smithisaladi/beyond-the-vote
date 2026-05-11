# apps/api/app/schemas/politicians.py
from pydantic import BaseModel

class PoliticianSummary(BaseModel):
    id: str
    bioguideId: str
    name: str
    title: str | None = None
    party: str | None = None
    state: str | None = None
    district: str | None = None
    photo: str | None = None
    ideologyScore: float | None = None

class PoliticianSearchResponse(BaseModel):
    politicians: list[PoliticianSummary]
