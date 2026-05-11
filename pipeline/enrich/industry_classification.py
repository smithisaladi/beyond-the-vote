"""Tier 1c: Industry classification of canonical employers.

Supports two modes:
- LLM batch API (Anthropic) for high-quality classification
- Local embedding similarity fallback (free, lower quality)
"""
import os
from pathlib import Path

import numpy as np
import structlog

import psycopg2.extras

from shared.db import upsert, get_conn
from shared.embeddings import get_model, embed_texts

log = structlog.get_logger()

MODEL_VERSION = "industry_class_v1"

INDUSTRY_BUCKETS = [
    "Finance", "Technology", "Healthcare", "Energy", "Real Estate",
    "Legal", "Defense", "Education", "Agriculture", "Transportation",
    "Media & Entertainment", "Retail & Consumer", "Manufacturing",
    "Hospitality", "Telecom", "Construction", "Insurance",
    "Pharma & Biotech", "Government", "Nonprofit", "Other",
]

_INDUSTRY_EXEMPLARS = {
    "Finance": ["Goldman Sachs", "JPMorgan Chase", "Bank of America", "Morgan Stanley", "Citigroup"],
    "Technology": ["Google", "Microsoft", "Apple", "Amazon", "Meta", "Salesforce"],
    "Healthcare": ["Kaiser Permanente", "UnitedHealth Group", "Mayo Clinic", "HCA Healthcare"],
    "Energy": ["ExxonMobil", "Chevron", "Shell", "BP", "ConocoPhillips", "NextEra Energy"],
    "Real Estate": ["CBRE Group", "Jones Lang LaSalle", "Cushman & Wakefield", "Zillow"],
    "Legal": ["Kirkland & Ellis", "Latham & Watkins", "DLA Piper", "Skadden Arps"],
    "Defense": ["Lockheed Martin", "Raytheon", "Boeing Defense", "Northrop Grumman", "General Dynamics"],
    "Education": ["Harvard University", "Stanford University", "University of Michigan"],
    "Agriculture": ["Cargill", "Archer Daniels Midland", "Deere & Company", "Monsanto"],
    "Transportation": ["FedEx", "UPS", "Delta Air Lines", "Union Pacific", "CSX"],
    "Media & Entertainment": ["Walt Disney", "Comcast NBCUniversal", "Warner Bros", "Netflix"],
    "Retail & Consumer": ["Walmart", "Target", "Costco", "Home Depot", "Procter & Gamble"],
    "Manufacturing": ["General Electric", "3M", "Caterpillar", "Honeywell", "Siemens"],
    "Hospitality": ["Marriott", "Hilton", "McDonald's", "Starbucks", "Yum! Brands"],
    "Telecom": ["AT&T", "Verizon", "T-Mobile", "Comcast"],
    "Construction": ["Bechtel", "Fluor", "Turner Construction", "Jacobs Engineering"],
    "Insurance": ["Berkshire Hathaway", "AIG", "MetLife", "Prudential Financial"],
    "Pharma & Biotech": ["Pfizer", "Johnson & Johnson", "Merck", "AbbVie", "Amgen"],
    "Government": ["US Government", "Department of Defense", "State Department"],
    "Nonprofit": ["Red Cross", "United Way", "Salvation Army", "Habitat for Humanity"],
    "Other": [],
}


def build_classification_prompt(employers: list[str]) -> str:
    industries_list = "\n".join(f"- {b}" for b in INDUSTRY_BUCKETS)
    employers_list = "\n".join(employers)
    return f"""Classify each employer into exactly one industry. Industries:
{industries_list}

For each employer, respond with one line: employer_name|industry|confidence (0.0-1.0)

Employers:
{employers_list}"""


def parse_classification_response(response: str) -> list[dict]:
    results = []
    for line in response.strip().split("\n"):
        parts = line.split("|")
        if len(parts) != 3:
            continue
        employer = parts[0].strip()
        industry = parts[1].strip()
        try:
            confidence = float(parts[2].strip())
        except ValueError:
            confidence = 0.5
        if industry not in INDUSTRY_BUCKETS:
            industry = "Other"
            confidence = min(confidence, 0.3)
        results.append({"employer": employer, "industry": industry, "confidence": confidence})
    return results


def classify_employers_batch_local(employers: list[str]) -> list[dict]:
    model = get_model()
    employer_embeddings = np.array(embed_texts(model, employers))

    industry_centroids = {}
    for industry, exemplars in _INDUSTRY_EXEMPLARS.items():
        if not exemplars:
            continue
        embs = np.array(embed_texts(model, exemplars))
        industry_centroids[industry] = embs.mean(axis=0)

    industry_names = list(industry_centroids.keys())
    centroid_matrix = np.array([industry_centroids[n] for n in industry_names])

    employer_norms = np.linalg.norm(employer_embeddings, axis=1, keepdims=True) + 1e-8
    centroid_norms = np.linalg.norm(centroid_matrix, axis=1, keepdims=True) + 1e-8
    similarities = (employer_embeddings / employer_norms) @ (centroid_matrix / centroid_norms).T

    results = []
    for i, employer in enumerate(employers):
        best_idx = int(np.argmax(similarities[i]))
        confidence = float(similarities[i][best_idx])
        industry = industry_names[best_idx]
        if confidence < 0.3:
            industry = "Other"
        results.append({"employer": employer, "industry": industry, "confidence": round(confidence, 3)})
    return results


def run_industry_classification(use_llm: bool = False) -> int:
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("SELECT canonical_employer_id, canonical_name FROM enrichment.employer_canonical")
    result_data = [dict(r) for r in cur.fetchall()]

    if not result_data:
        log.warning("no_employers_to_classify")
        return 0

    seen = set()
    employers_to_classify = []
    for row in result_data:
        if row["canonical_employer_id"] not in seen:
            seen.add(row["canonical_employer_id"])
            employers_to_classify.append(row)

    cur.execute("SELECT canonical_employer_id FROM enrichment.employer_industry")
    existing_data = [dict(r) for r in cur.fetchall()]
    existing_ids = {r["canonical_employer_id"] for r in existing_data}

    to_classify = [e for e in employers_to_classify if e["canonical_employer_id"] not in existing_ids]
    log.info("employers_to_classify", total=len(to_classify), already_classified=len(existing_ids))

    if not to_classify:
        return 0

    names = [e["canonical_name"] for e in to_classify]

    if use_llm:
        log.info("using_llm_classification")
        all_results = []
        for i in range(0, len(names), 100):
            batch_names = names[i:i + 100]
            prompt = build_classification_prompt(batch_names)
            import anthropic
            api_key = os.environ["ANTHROPIC_API_KEY"]
            client_ai = anthropic.Anthropic(api_key=api_key)
            response = client_ai.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
            parsed = parse_classification_response(response.content[0].text)
            all_results.extend(parsed)
    else:
        log.info("using_local_classification")
        all_results = classify_employers_batch_local(names)

    rows = []
    for emp_data, classification in zip(to_classify, all_results):
        rows.append({
            "canonical_employer_id": emp_data["canonical_employer_id"],
            "industry": classification["industry"],
            "confidence": classification["confidence"],
            "model_version": MODEL_VERSION + ("_llm" if use_llm else "_local"),
        })

    total = upsert("employer_industry", rows, schema="enrichment")
    log.info("industry_classification_complete", rows=total)
    return total
