"""Combined industry classifier — 4 tiers.

1. Exact match in OpenSecrets org_to_industry.tsv (confidence 0.95)
2. Suffix-stripped match (confidence 0.90)
3. Keyword rules — extensive pattern matching (confidence 0.70-0.85)
4. Fallback "Other" (confidence 0.2)
"""
import re
from collections import Counter
from pathlib import Path

import structlog

from shared.db import upsert, get_conn
from enrich.opensecrets import load_org_lookup, load_crp_categories, _normalize_for_lookup

log = structlog.get_logger()

MODEL_VERSION = "industry_combined_v4"

# Extensive keyword → industry rules
_KEYWORD_RULES: list[tuple[list[str], str, float]] = [
    # Finance
    (["bank", "banking", "credit union", "savings"], "Finance, Insurance & Real Estate", 0.85),
    (["capital", "financial", "investment", "wealth", "asset management"], "Finance, Insurance & Real Estate", 0.80),
    (["insurance", "mutual", "underwriter", "actuari"], "Finance, Insurance & Real Estate", 0.82),
    (["real estate", "realty", "realtor", "realtors", "property", "mortgage", "title"], "Finance, Insurance & Real Estate", 0.82),
    (["securities", "brokerage", "hedge fund", "venture", "equity"], "Finance, Insurance & Real Estate", 0.80),
    (["accounting", "accountant", "cpa", "tax service"], "Finance, Insurance & Real Estate", 0.78),

    # Health
    (["hospital", "medical center", "health system", "clinic"], "Health", 0.85),
    (["doctor", "physician", "surgeon", "dentist", "dental", "orthodont"], "Health", 0.85),
    (["pharmacy", "pharmaceutical", "pharma", "rx", "drug"], "Health", 0.80),
    (["nursing", "nurse", "home health", "hospice", "rehabilitation"], "Health", 0.82),
    (["biotech", "bioscience", "genomic", "medical device"], "Health", 0.78),
    (["optometri", "ophthalmolog", "chiropract", "physical therap"], "Health", 0.82),
    (["mental health", "psychiatr", "psycholog", "counseling", "behavioral"], "Health", 0.80),
    (["veterinar"], "Health", 0.75),

    # Legal
    (["law firm", "law office", "attorney", "lawyer", "legal", "counsel"], "Lawyers & Lobbyists", 0.85),
    (["llp", "pllc"], "Lawyers & Lobbyists", 0.65),  # lower — could be accounting
    (["lobbyist", "lobbying", "government affairs", "advocacy"], "Lawyers & Lobbyists", 0.80),

    # Education
    (["university", "college", "school district", "school board"], "Education", 0.88),
    (["school", "academy", "institute", "education"], "Education", 0.80),
    (["professor", "teacher", "faculty"], "Education", 0.75),

    # Technology / Communications
    (["software", "tech", "technology", "digital", "cyber", "cloud"], "Communications/Electronics", 0.78),
    (["internet", "online", "web", "app", "saas", "platform"], "Communications/Electronics", 0.75),
    (["telecom", "wireless", "broadband", "cable", "satellite"], "Communications/Electronics", 0.80),
    (["media", "broadcast", "television", "radio", "film", "studio"], "Communications/Electronics", 0.78),
    (["publishing", "newspaper", "magazine", "print"], "Communications/Electronics", 0.75),

    # Energy
    (["oil", "petroleum", "refinery", "drilling", "pipeline"], "Energy & Natural Resources", 0.82),
    (["gas", "natural gas", "propane", "lng"], "Energy & Natural Resources", 0.75),
    (["solar", "wind energy", "renewable", "clean energy", "geothermal"], "Energy & Natural Resources", 0.80),
    (["electric", "utility", "power", "energy"], "Energy & Natural Resources", 0.72),
    (["mining", "coal", "mineral"], "Energy & Natural Resources", 0.80),

    # Construction
    (["construction", "contractor", "builder", "building"], "Construction", 0.82),
    (["plumbing", "plumber", "hvac", "heating", "air condition"], "Construction", 0.82),
    (["electrical contractor", "electrician", "wiring"], "Construction", 0.80),
    (["architect", "engineering", "surveyor", "excavat", "paving"], "Construction", 0.78),
    (["roofing", "painting", "flooring", "concrete", "masonry"], "Construction", 0.82),
    (["landscap"], "Construction", 0.75),

    # Transportation
    (["airline", "aviation", "airport", "pilot"], "Transportation", 0.82),
    (["trucking", "freight", "shipping", "logistics", "warehouse"], "Transportation", 0.82),
    (["railroad", "railway", "rail"], "Transportation", 0.82),
    (["auto dealer", "car dealer", "automotive"], "Transportation", 0.78),
    (["taxi", "rideshare", "uber", "lyft", "bus", "transit"], "Transportation", 0.78),

    # Agriculture
    (["farm", "ranch", "dairy", "poultry", "livestock", "cattle"], "Agribusiness", 0.82),
    (["agriculture", "crop", "grain", "seed", "fertilizer"], "Agribusiness", 0.82),
    (["vineyard", "winery", "brewery"], "Agribusiness", 0.75),

    # Defense
    (["defense", "military", "army", "navy", "air force", "marine"], "Defense", 0.80),
    (["aerospace", "missile", "weapon", "munition"], "Defense", 0.80),

    # Labor
    (["union", "local ", "afscme", "seiu", "teamster", "aft", "afl-cio"], "Labor", 0.82),
    (["ibew", "ufcw", "uaw", "usw", "iatse"], "Labor", 0.85),

    # Misc Business (retail, food, hospitality)
    (["restaurant", "cafe", "diner", "pizza", "food service", "catering"], "Misc Business", 0.78),
    (["hotel", "motel", "resort", "hospitality", "lodging"], "Misc Business", 0.78),
    (["retail", "store", "shop", "boutique", "mall"], "Misc Business", 0.72),
    (["manufactur", "factory", "industrial", "steel", "metal"], "Misc Business", 0.72),
    (["consulting", "consultant", "advisory"], "Misc Business", 0.65),
]


def classify_employer_combined(
    employer: str,
    org_lookup: dict[str, str],
    crp_categories: dict[str, dict],
) -> tuple[str, float]:
    """Classify an employer through 4 tiers."""

    # Tier 1+2: Exact and suffix-stripped lookup
    variants = _normalize_for_lookup(employer)
    for variant in variants:
        catcode = org_lookup.get(variant)
        if catcode:
            cat = crp_categories.get(catcode)
            if cat:
                return cat["sector"], 0.95
            return "Other", 0.5

    # Tier 3: Keyword rules
    emp_lower = employer.lower()
    best_match = None
    best_confidence = 0

    for keywords, industry, confidence in _KEYWORD_RULES:
        for kw in keywords:
            if kw in emp_lower:
                if confidence > best_confidence:
                    best_match = industry
                    best_confidence = confidence
                break  # Found a keyword in this rule, move to next rule

    if best_match and best_confidence >= 0.65:
        return best_match, best_confidence

    # Tier 4: Fallback
    return "Other", 0.2


def run_industry_classification_combined(data_dir: Path) -> int:
    """Run the combined 4-tier industry classifier."""
    crp_categories = load_crp_categories(data_dir)
    org_lookup = load_org_lookup(data_dir)

    import psycopg2.extras

    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Get all canonical employers
    cur.execute("SELECT canonical_employer_id, canonical_name FROM enrichment.employer_canonical")
    result_data = [dict(r) for r in cur.fetchall()]

    if not result_data:
        log.warning("no_employers_to_classify")
        return 0

    # Deduplicate
    seen = set()
    to_classify = []
    for row in result_data:
        if row["canonical_employer_id"] not in seen:
            seen.add(row["canonical_employer_id"])
            to_classify.append(row)

    log.info("classifying_employers", total=len(to_classify))

    # Clear old classifications
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("TRUNCATE enrichment.employer_industry")

    # Classify all
    rows = []
    stats: Counter = Counter()
    tier_stats: Counter = Counter()

    for emp in to_classify:
        industry, confidence = classify_employer_combined(
            emp["canonical_name"], org_lookup, crp_categories
        )
        stats[industry] += 1
        if confidence >= 0.9:
            tier_stats["exact_match"] += 1
        elif confidence >= 0.65:
            tier_stats["keyword_match"] += 1
        else:
            tier_stats["unmatched"] += 1

        rows.append({
            "canonical_employer_id": emp["canonical_employer_id"],
            "industry": industry,
            "confidence": confidence,
            "model_version": MODEL_VERSION,
        })

    total = upsert("employer_industry", rows, schema="enrichment")

    classified_pct = (1 - stats.get("Other", 0) / max(len(to_classify), 1)) * 100

    log.info("industry_classification_complete",
             rows=total, classified_pct=round(classified_pct, 1),
             tiers=dict(tier_stats),
             top_industries=dict(stats.most_common(15)))
    return total
