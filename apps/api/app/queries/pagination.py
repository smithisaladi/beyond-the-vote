"""Shared helpers for COUNT(*) OVER() pagination."""
from sqlalchemy.ext.asyncio import AsyncSession


async def paged_total(session: AsyncSession, stmt, params: dict, rows) -> int:
    """Total for COUNT(*) OVER() pagination. An offset past the end returns no
    rows (and no window count), so re-probe at offset 0 for the real total."""
    if rows:
        return rows[0]["total_count"]
    if params.get("offset"):
        probe = await session.execute(stmt, {**params, "limit": 1, "offset": 0})
        first = probe.mappings().first()
        if first:
            return first["total_count"]
    return 0
