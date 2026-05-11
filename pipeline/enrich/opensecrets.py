"""OpenSecrets CRP industry classification using real employer→industry mappings.

Uses two data files:
1. CRP_Categories.txt — taxonomy (catcode → industry name → sector)
2. org_to_industry.tsv — 769K employer→catcode mappings extracted from OpenSecrets bulk data

Three-tier classification:
1. Direct lookup in org_to_industry.tsv (highest accuracy, ~60-70% hit rate)
2. Normalized fuzzy match (strip suffixes like Inc/LLC/Corp, retry)
3. Fallback to "Other" with low confidence
"""
import csv
import re
from collections import Counter
from pathlib import Path

import structlog

from shared.db import upsert, get_supabase

log = structlog.get_logger()

MODEL_VERSION = "industry_opensecrets_v2_bulk"

CRP_CATEGORIES_URL = "https://www.opensecrets.org/downloads/crp/CRP_Categories.txt"


def load_crp_categories(data_dir: Path) -> dict[str, dict]:
    """Load and parse CRP_Categories.txt → {catcode: {name, industry, sector}}."""
    import httpx

    path = data_dir / "opensecrets" / "CRP_Categories.txt"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        log.info("downloading_crp_categories")
        resp = httpx.get(CRP_CATEGORIES_URL, follow_redirects=True, timeout=30)
        resp.raise_for_status()
        path.write_bytes(resp.content)

    categories = {}
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            if line.startswith('"') or line.startswith("Catcode") or not line.strip():
                continue
            parts = line.strip().split("\t")
            if len(parts) < 5:
                continue
            catcode = parts[0].strip()
            catname = parts[1].strip().strip('"')
            industry = parts[3].strip().strip('"')
            sector_long = parts[5].strip().strip('"') if len(parts) > 5 else ""

            if catcode:
                categories[catcode] = {
                    "catcode": catcode,
                    "name": catname,
                    "industry": industry or catname,
                    "sector": sector_long or catname,
                }

    log.info("crp_categories_loaded", count=len(categories))
    return categories


def load_org_lookup(data_dir: Path) -> dict[str, str]:
    """Load org_to_industry.tsv → {UPPERCASED_ORGNAME: catcode}."""
    path = data_dir / "opensecrets" / "org_to_industry.tsv"
    if not path.exists():
        log.warning("org_to_industry_not_found", path=str(path))
        return {}

    lookup = {}
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) == 2:
                lookup[parts[0].strip()] = parts[1].strip()

    log.info("org_lookup_loaded", entries=len(lookup))
    return lookup


# Suffixes to strip for fuzzy matching
_SUFFIXES = re.compile(
    r'\s*,?\s*\b(INC\.?|LLC\.?|LLP\.?|LP\.?|CORP\.?|CORPORATION|CO\.?|COMPANY|GROUP|'
    r'PARTNERS|PARTNERSHIP|ASSOCIATES|ASSOC\.?|INTERNATIONAL|INTL\.?|'
    r'HOLDINGS|ENTERPRISES|SERVICES|SOLUTIONS|CONSULTING|MANAGEMENT|'
    r'INDUSTRIES|SYSTEMS|TECHNOLOGIES|TECHNOLOGY|GLOBAL|USA|US|PC|PLLC|PA|NA)\s*$',
    re.IGNORECASE
)


def _normalize_for_lookup(name: str) -> list[str]:
    """Generate lookup variants for an employer name."""
    upper = name.strip().upper()
    variants = [upper]

    # Strip common suffixes
    stripped = _SUFFIXES.sub("", upper).strip().rstrip(",").strip()
    if stripped and stripped != upper:
        variants.append(stripped)

    # Strip "THE " prefix
    if upper.startswith("THE "):
        variants.append(upper[4:])
        stripped2 = _SUFFIXES.sub("", upper[4:]).strip().rstrip(",").strip()
        if stripped2:
            variants.append(stripped2)

    return variants


def classify_employer(
    employer: str,
    org_lookup: dict[str, str],
    crp_categories: dict[str, dict],
) -> tuple[str, float]:
    """Classify an employer using OpenSecrets org→industry lookup.

    Returns: (sector_name, confidence)
    """
    variants = _normalize_for_lookup(employer)

    for variant in variants:
        catcode = org_lookup.get(variant)
        if catcode:
            cat = crp_categories.get(catcode)
            if cat:
                return cat["sector"], 0.95
            # Unknown catcode but still matched
            return "Other", 0.5

    return "Other", 0.2


def run_industry_classification_opensecrets(data_dir: Path) -> int:
    """Classify canonical employers using OpenSecrets bulk data lookup.

    Reads from enrichment.employer_canonical, writes to enrichment.employer_industry.
    """
    crp_categories = load_crp_categories(data_dir)
    org_lookup = load_org_lookup(data_dir)

    if not org_lookup:
        log.warning("no_org_lookup_available_falling_back_to_heuristics")
        return 0

    client = get_supabase()

    # Get canonical employers
    result = client.schema("enrichment").table("employer_canonical").select(
        "canonical_employer_id, canonical_name"
    ).execute()

    if not result.data:
        log.warning("no_employers_to_classify")
        return 0

    # Deduplicate
    seen = set()
    to_classify = []
    for row in result.data:
        if row["canonical_employer_id"] not in seen:
            seen.add(row["canonical_employer_id"])
            to_classify.append(row)

    # Check existing
    existing = client.schema("enrichment").table("employer_industry").select(
        "canonical_employer_id"
    ).execute()
    existing_ids = {r["canonical_employer_id"] for r in existing.data}
    to_classify = [e for e in to_classify if e["canonical_employer_id"] not in existing_ids]

    log.info("employers_to_classify", total=len(to_classify), already=len(existing_ids))

    if not to_classify:
        return 0

    # Classify
    rows = []
    stats: Counter = Counter()
    matched = 0

    for emp in to_classify:
        industry, confidence = classify_employer(emp["canonical_name"], org_lookup, crp_categories)
        stats[industry] += 1
        if confidence > 0.5:
            matched += 1
        rows.append({
            "canonical_employer_id": emp["canonical_employer_id"],
            "industry": industry,
            "confidence": confidence,
            "model_version": MODEL_VERSION,
        })

    match_rate = matched / len(to_classify) if to_classify else 0
    total = upsert("employer_industry", rows, schema="enrichment")

    log.info("industry_classification_complete",
             rows=total, match_rate=round(match_rate, 3),
             top_industries=dict(stats.most_common(10)))
    return total
