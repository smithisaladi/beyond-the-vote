# apps/api/app/schemas/common.py
from pydantic import BaseModel

class PaginationMeta(BaseModel):
    total: int
    limit: int
    offset: int

class ErrorResponse(BaseModel):
    detail: str
