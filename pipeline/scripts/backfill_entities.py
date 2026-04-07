"""
One-time backfill: iterates all existing bills in bill_embeddings,
fetches their XML from govinfo.gov, and populates the entity columns.

Run: python pipeline/scripts/backfill_entities.py

Resume-safe: skips bills where referenced_agencies is already non-empty.
Set FORCE=1 to reprocess all bills regardless.
"""
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from pipeline.lib.supabase_client import create_service_client
from pipeline.lib.fetch_bill_text import fetch_bill_text_xml, extract_text_from_bill_xml
from pipeline.lib.federal_agencies import extract_agencies
from pipeline.lib.parse_citations import extract_citations
from pipeline.lib.config import RATE_LIMIT_GOVINFO

FORCE = os.environ.get("FORCE") == "1"


def backfill_entities() -> None:
    supabase = create_service_client()

    query = (
        supabase.table("bills")
        .select("bill_id, congress")
        .order("introduced_date", desc=True)
    )
    if not FORCE:
        query = query.eq("referenced_agencies", "{}")

    resp = query.execute()
    bills = resp.data or []

    total = len(bills)
    print(f"Backfilling {total} bills (FORCE={FORCE})...")

    processed = updated = skipped = 0

    for bill in bills:
        parts = bill["bill_id"].split("-")
        if len(parts) < 3:
            skipped += 1
            continue

        congress = int(parts[0])
        bill_type = parts[1]
        number = "-".join(parts[2:])

        xml = fetch_bill_text_xml(congress, bill_type, number)

        if xml:
            full_text = extract_text_from_bill_xml(xml)
            agencies = extract_agencies(full_text)
            citations = extract_citations(full_text)

            update_resp = (
                supabase.table("bills")
                .update({
                    "referenced_agencies": agencies,
                    "referenced_laws":     citations.act_names + citations.public_laws,
                    "referenced_usc":      citations.usc_sections,
                })
                .eq("bill_id", bill["bill_id"])
                .execute()
            )
            updated += 1
        else:
            skipped += 1

        processed += 1
        if processed % 25 == 0 or processed == total:
            print(f"  {processed}/{total} processed — {updated} updated, {skipped} skipped")

        time.sleep(RATE_LIMIT_GOVINFO)

    print(f"\nDone. {updated} bills updated, {skipped} skipped (no XML or parse error).")


if __name__ == "__main__":
    backfill_entities()
