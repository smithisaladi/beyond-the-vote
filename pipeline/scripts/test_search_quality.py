"""
Search quality validation for hybrid_bill_search.

Tests representative queries across all expected input categories and prints
the top-3 results for each with their RRF scores. Run after a full bill sync.

Run: python pipeline/scripts/test_search_quality.py

Optional: TEST_LIMIT=5 to show more results per query.
"""
import os
import sys
import re
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from pipeline.lib.supabase_client import create_service_client

LIMIT = int(os.environ.get("TEST_LIMIT", "3"))

TEST_QUERIES = [
    # Bill number / ID lookups
    {"label": "Bill ID format",           "query": "119-s-1247",    "signal": "lookup"},
    {"label": "Senate formatted number",  "query": "S. 1247",       "signal": "lookup"},
    {"label": "House formatted number",   "query": "HR 3076",       "signal": "lookup"},
    {"label": "HR with period",           "query": "H.R. 3076",     "signal": "lookup"},
    # Single keyword
    {"label": "immigration",              "query": "immigration",   "signal": "fts"},
    {"label": "healthcare",               "query": "healthcare",    "signal": "fts"},
    {"label": "guns",                     "query": "guns",          "signal": "fts"},
    {"label": "education",                "query": "education",     "signal": "fts"},
    {"label": "climate",                  "query": "climate",       "signal": "fts"},
    # Multi-word / phrase
    {"label": "clean energy tax credit",  "query": "clean energy tax credit",          "signal": "fts"},
    {"label": "student loan forgiveness", "query": "student loan forgiveness",         "signal": "fts"},
    {"label": "border security",          "query": "border security",                  "signal": "fts"},
    {"label": "affordable housing",       "query": "affordable housing",               "signal": "fts"},
    {"label": "prescription drug prices", "query": "prescription drug prices",         "signal": "fts"},
    # Natural language
    {"label": "kids online safety",       "query": "bills about protecting kids online",     "signal": "fts"},
    {"label": "veterans healthcare",      "query": "healthcare for veterans",                "signal": "fts"},
    {"label": "data privacy",             "query": "data privacy protections",               "signal": "fts"},
    {"label": "immigration reform",       "query": "comprehensive immigration reform",       "signal": "fts"},
    {"label": "climate change",           "query": "bills about climate change",             "signal": "fts"},
    # Typos / fuzzy (trigram signal expected)
    {"label": "typo: helthcare",          "query": "helthcare",     "signal": "trgm"},
    {"label": "typo: imigration",         "query": "imigration",    "signal": "trgm"},
    {"label": "typo: educaton",           "query": "educaton",      "signal": "trgm"},
    {"label": "partial: infrastructur",   "query": "infrastructur", "signal": "trgm"},
    # Sponsor name
    {"label": "sponsor by last name",     "query": "Sanders",       "signal": "fts"},
    {"label": "sponsor by first+last",    "query": "Bernie Sanders", "signal": "fts"},
]

BILL_ID_RE = re.compile(r"^\d{3}-[a-z]+-\d+$", re.IGNORECASE)
BILL_NUMBER_RE = re.compile(r"^[hs]\.?\s*(?:r(?:es)?|j\.?res|con\.?res)?\.?\s*\d+$", re.IGNORECASE)


def is_lookup(query: str) -> bool:
    return bool(BILL_ID_RE.match(query) or BILL_NUMBER_RE.match(query.replace(" ", "")))


def run_query(supabase, query: str) -> list[dict]:
    if is_lookup(query):
        resp = supabase.rpc("lookup_bill", {"query_text": query}).execute()
        return (resp.data or [])[:LIMIT]

    resp = supabase.rpc("hybrid_bill_search", {
        "query_text":      query,
        "result_limit":    LIMIT,
        "offset_count":    0,
        "status_filter":   None,
        "topic_filter":    None,
        "policy_areas":    None,
        "congress_filter": None,
    }).execute()
    return resp.data or []


def main() -> None:
    supabase = create_service_client()
    passed = no_results = 0

    print(f"\n{'─' * 70}")
    print(f"  HYBRID SEARCH QUALITY TEST  (top {LIMIT} results per query)")
    print(f"{'─' * 70}\n")

    for q in TEST_QUERIES:
        label, query, signal = q["label"], q["query"], q["signal"]
        try:
            results = run_query(supabase, query)
        except Exception as err:
            print(f"  ✗ [{label}] ERROR: {err}")
            continue

        has_results = bool(results)
        if has_results:
            passed += 1
        else:
            no_results += 1

        status_icon = "✓" if has_results else "○"
        signal_tag = f"[{signal}]"
        print(f'{status_icon} {signal_tag:<9} "{query}"  ({label})')

        if has_results:
            for r in results:
                score_str = f"  score={r['rrf_score']:.5f}" if "rrf_score" in r else "  (exact match)"
                title = (r.get("title") or "")[:70]
                print(f"     • {r.get('bill_number') or r.get('bill_id')}  {title}{score_str}")
        else:
            print("     (no results)")
        print()

    print(f"{'─' * 70}")
    print(f"  {passed}/{len(TEST_QUERIES)} queries returned results   {no_results} returned nothing")
    print(f"{'─' * 70}\n")


if __name__ == "__main__":
    main()
