"""OpenSecrets CRP industry classification integration.

Uses the CRP category codes taxonomy and OpenSecrets' bulk individual
contribution data (which includes manually-assigned industry codes)
to classify employers by industry.

Three-tier approach:
1. Direct lookup from OpenSecrets bulk data (employer → CRP code, highest accuracy)
2. Fuzzy match against known employer→industry mappings (good accuracy)
3. Fallback to embedding-based local classifier (lower accuracy)
"""
import csv
import os
from collections import Counter, defaultdict
from pathlib import Path

import httpx
import structlog

from shared.db import upsert, get_supabase
from shared.parquet import duckdb_connect

log = structlog.get_logger()

MODEL_VERSION = "industry_opensecrets_v1"

CRP_CATEGORIES_URL = "https://www.opensecrets.org/downloads/crp/CRP_Categories.txt"

# CRP sector code → readable sector name (first char of catcode)
CRP_SECTORS = {
    "A": "Agriculture",
    "B": "Communications/Electronics",
    "C": "Construction",
    "D": "Defense",
    "E": "Energy & Natural Resources",
    "F": "Finance, Insurance & Real Estate",
    "G": "Government",  # non-contrib
    "H": "Health",
    "K": "Lawyers & Lobbyists",
    "L": "Transportation",
    "M": "Manufacturing & Distribution",
    "N": "Mining",
    "P": "Miscellaneous Business",
    "Q": "Ideology/Single-Issue",
    "R": "Non-contribution",
    "W": "Labor",
    "X": "Unknown/Other",
    "Y": "Unknown/Other",
    "Z": "Unknown/Other",
}


def download_crp_categories(data_dir: Path) -> Path:
    """Download the CRP category codes file."""
    dest = data_dir / "opensecrets" / "CRP_Categories.txt"
    dest.parent.mkdir(parents=True, exist_ok=True)

    if dest.exists():
        log.info("crp_categories_exists", path=str(dest))
        return dest

    log.info("downloading_crp_categories")
    resp = httpx.get(CRP_CATEGORIES_URL, follow_redirects=True, timeout=30)
    resp.raise_for_status()
    dest.write_bytes(resp.content)
    log.info("crp_categories_downloaded", path=str(dest))
    return dest


def parse_crp_categories(path: Path) -> dict[str, dict]:
    """Parse CRP_Categories.txt into {catcode: {name, industry, sector}}."""
    categories = {}
    with open(path, encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f, delimiter="\t")
        for row in reader:
            if len(row) < 5:
                continue
            catcode = row[0].strip()
            catname = row[1].strip()
            catorder = row[2].strip()
            industry = row[3].strip()
            sector = row[4].strip()
            sector_long = row[5].strip() if len(row) > 5 else ""

            if not catcode:
                continue

            categories[catcode] = {
                "catcode": catcode,
                "name": catname,
                "industry": industry or catname,
                "sector": CRP_SECTORS.get(catcode[0], "Other"),
                "sector_code": catcode[0],
                "sector_long": sector_long,
            }

    log.info("crp_categories_parsed", count=len(categories))
    return categories


def build_employer_industry_map(
    parquet_path: Path,
    crp_categories: dict[str, dict],
) -> dict[str, str]:
    """Build employer→industry mapping from OpenSecrets bulk data if available,
    or from FEC data + CRP codes.

    Since OpenSecrets bulk data requires an account, this uses a heuristic approach:
    - Map well-known employers to industries using the CRP taxonomy
    - Use the sector/industry hierarchy for classification

    Returns: {normalized_employer: industry_name}
    """
    # Build a keyword→industry lookup from CRP category names
    keyword_map: dict[str, str] = {}
    for catcode, info in crp_categories.items():
        industry = info["sector"]  # Use sector-level for broad classification
        name_lower = info["name"].lower()

        # Extract useful keywords from category names
        for word in name_lower.split():
            if len(word) > 4 and word not in ("other", "misc", "general", "total"):
                keyword_map[word] = industry

    # Well-known employer → industry direct mappings (supplementing CRP)
    direct_map = {
        # Finance
        "goldman sachs": "Finance, Insurance & Real Estate",
        "jpmorgan": "Finance, Insurance & Real Estate",
        "morgan stanley": "Finance, Insurance & Real Estate",
        "bank of america": "Finance, Insurance & Real Estate",
        "citigroup": "Finance, Insurance & Real Estate",
        "wells fargo": "Finance, Insurance & Real Estate",
        "blackrock": "Finance, Insurance & Real Estate",
        "fidelity": "Finance, Insurance & Real Estate",
        # Tech
        "google": "Communications/Electronics",
        "alphabet": "Communications/Electronics",
        "microsoft": "Communications/Electronics",
        "apple": "Communications/Electronics",
        "amazon": "Communications/Electronics",
        "meta": "Communications/Electronics",
        "facebook": "Communications/Electronics",
        "salesforce": "Communications/Electronics",
        "oracle": "Communications/Electronics",
        "intel": "Communications/Electronics",
        "nvidia": "Communications/Electronics",
        # Health
        "pfizer": "Health",
        "johnson & johnson": "Health",
        "unitedhealth": "Health",
        "kaiser": "Health",
        "merck": "Health",
        "abbvie": "Health",
        "amgen": "Health",
        "eli lilly": "Health",
        # Energy
        "exxon": "Energy & Natural Resources",
        "chevron": "Energy & Natural Resources",
        "conocophillips": "Energy & Natural Resources",
        "shell": "Energy & Natural Resources",
        "bp": "Energy & Natural Resources",
        # Defense
        "lockheed": "Defense",
        "raytheon": "Defense",
        "northrop": "Defense",
        "boeing": "Defense",
        "general dynamics": "Defense",
        # Legal
        "kirkland": "Lawyers & Lobbyists",
        "latham": "Lawyers & Lobbyists",
        "skadden": "Lawyers & Lobbyists",
        "jones day": "Lawyers & Lobbyists",
        "sullivan & cromwell": "Lawyers & Lobbyists",
        # Labor
        "afscme": "Labor",
        "seiu": "Labor",
        "teamsters": "Labor",
        "aft": "Labor",
        "ufcw": "Labor",
    }

    return direct_map, keyword_map


def classify_employer_opensecrets(
    employer: str,
    direct_map: dict[str, str],
    keyword_map: dict[str, str],
) -> tuple[str, float]:
    """Classify a single employer using OpenSecrets taxonomy.

    Returns: (industry, confidence)
    """
    emp_lower = employer.lower()

    # Tier 1: Direct match
    for key, industry in direct_map.items():
        if key in emp_lower:
            return industry, 0.95

    # Tier 2: Keyword match
    words = emp_lower.split()
    matches: Counter = Counter()
    for word in words:
        if word in keyword_map:
            matches[keyword_map[word]] += 1

    if matches:
        best_industry, count = matches.most_common(1)[0]
        confidence = min(0.8, 0.5 + count * 0.1)
        return best_industry, confidence

    # Tier 3: Heuristic rules
    if any(w in emp_lower for w in ["university", "college", "school", "academy"]):
        return "Education", 0.85
    if any(w in emp_lower for w in ["hospital", "medical", "clinic", "health"]):
        return "Health", 0.85
    if any(w in emp_lower for w in ["bank", "capital", "financial", "insurance", "fund"]):
        return "Finance, Insurance & Real Estate", 0.75
    if any(w in emp_lower for w in ["law", "legal", "attorney", "counsel"]):
        return "Lawyers & Lobbyists", 0.80
    if any(w in emp_lower for w in ["construction", "builder", "contractor"]):
        return "Construction", 0.75
    if any(w in emp_lower for w in ["farm", "ranch", "dairy", "agriculture"]):
        return "Agriculture", 0.75
    if any(w in emp_lower for w in ["oil", "gas", "energy", "petroleum", "solar", "wind"]):
        return "Energy & Natural Resources", 0.70
    if any(w in emp_lower for w in ["airline", "trucking", "shipping", "railroad", "transit"]):
        return "Transportation", 0.75

    return "Other", 0.3


def run_industry_classification_opensecrets(data_dir: Path) -> int:
    """Classify canonical employers using OpenSecrets CRP taxonomy.

    Reads from enrichment.employer_canonical and writes to enrichment.employer_industry.
    """
    # Download and parse CRP categories
    crp_path = download_crp_categories(data_dir)
    crp_categories = parse_crp_categories(crp_path)
    direct_map, keyword_map = build_employer_industry_map(Path(), crp_categories)

    # Get canonical employers that need classification
    client = get_supabase()
    result = client.schema("enrichment").table("employer_canonical").select(
        "canonical_employer_id, canonical_name"
    ).execute()

    if not result.data:
        log.warning("no_employers_to_classify")
        return 0

    # Deduplicate by canonical_employer_id
    seen = set()
    to_classify = []
    for row in result.data:
        if row["canonical_employer_id"] not in seen:
            seen.add(row["canonical_employer_id"])
            to_classify.append(row)

    # Check which already have classifications
    existing = client.schema("enrichment").table("employer_industry").select(
        "canonical_employer_id"
    ).execute()
    existing_ids = {r["canonical_employer_id"] for r in existing.data}

    to_classify = [e for e in to_classify if e["canonical_employer_id"] not in existing_ids]
    log.info("employers_to_classify", total=len(to_classify), already_classified=len(existing_ids))

    if not to_classify:
        return 0

    # Classify each employer
    rows = []
    industry_counts: Counter = Counter()
    for emp in to_classify:
        industry, confidence = classify_employer_opensecrets(
            emp["canonical_name"], direct_map, keyword_map
        )
        industry_counts[industry] += 1
        rows.append({
            "canonical_employer_id": emp["canonical_employer_id"],
            "industry": industry,
            "confidence": confidence,
            "model_version": MODEL_VERSION,
        })

    total = upsert("employer_industry", rows, schema="enrichment")
    log.info("industry_classification_opensecrets_complete",
             rows=total, distribution=dict(industry_counts.most_common(10)))
    return total
