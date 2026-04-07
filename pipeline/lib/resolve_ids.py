"""
Resolves LIS member IDs to bioguide IDs using the legislators table.
Port of scripts/lib/resolve-ids.ts
"""
from supabase import Client


def build_lis_map(supabase: Client, lis_ids: list[str]) -> dict[str, str]:
    """Returns a dict of lis_id → bioguide_id for the given lis_ids."""
    if not lis_ids:
        return {}

    resp = (
        supabase.table("legislators")
        .select("lis_id, bioguide_id")
        .in_("lis_id", lis_ids)
        .execute()
    )

    result: dict[str, str] = {}
    for row in resp.data or []:
        if row.get("lis_id") and row.get("bioguide_id"):
            result[row["lis_id"]] = row["bioguide_id"]
    return result
