"""
compute_funding_summaries.py — Derive legislator_funding_summary and
legislator_top_pacs from local FEC CSVs via DuckDB.

Must be run AFTER all FEC CSVs are written to data/processed/fec/.
Re-running is safe — rows are fully replaced (upserted) each time.

Usage:
    python scripts/compute_funding_summaries.py
    python3 scripts/compute_funding_summaries.py --cycles 2024 2026
"""

import argparse
import logging
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import DATA_PROCESSED_FEC, FEC_CYCLES, INDUSTRY_KEYWORDS, UPSERT_BATCH
from load import log_run_end, log_run_start, upsert
from utils import batch, duckdb_connect, get_supabase

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

SCRIPT = "compute_funding_summaries"
LARGE_DONOR_THRESHOLD = 200.0  # FEC itemization threshold
TOP_PACS_LIMIT = 20
TOP_CONTRIBUTORS_LIMIT = 20

# Non-employer values to exclude when grouping individual contributions by employer
NON_EMPLOYERS = {
    'SELF-EMPLOYED', 'SELF EMPLOYED', 'SELF', 'NONE', 'N/A', 'NA',
    'NOT EMPLOYED', 'RETIRED', 'INFORMATION REQUESTED',
    'INFORMATION REQUESTED PER BEST EFFORTS', 'REFUSED',
    'NOT APPLICABLE', 'HOMEMAKER', 'STUDENT', 'UNEMPLOYED',
    'NOT AVAILABLE', 'REQUESTED', 'BEST EFFORTS', 'DISABLED',
}


# ── Data loading ─────────────────────────────────────────────────────────────

def load_legislators() -> dict[str, dict]:
    """Return {bioguide_id: {state, fec_ids[]}} for all legislators from Supabase."""
    db = get_supabase()
    result: dict[str, dict] = {}
    offset = 0
    while True:
        res = db.table("legislators").select("bioguide_id,state,fec_ids").range(offset, offset + 999).execute()
        for row in res.data:
            result[row["bioguide_id"]] = row
        if len(res.data) < 1000:
            break
        offset += 1000
    log.info("Loaded %d legislators", len(result))
    return result


# ── Industry classification ───────────────────────────────────────────────────

def classify_industry(*names: str | None) -> str:
    """Classify industry from one or more name fields (connected_org_nm, cmte_nm).
    First match across all provided names wins."""
    for name in names:
        if not name:
            continue
        lower = name.lower()
        for keyword, industry in INDUSTRY_KEYWORDS:
            if keyword in lower:
                return industry
    return "Other"


def build_top_industries(industry_sums: dict[str, float], total: float) -> list[dict]:
    if not industry_sums or total <= 0:
        return []
    sorted_inds = sorted(industry_sums.items(), key=lambda x: x[1], reverse=True)
    result = []
    for industry, ind_total in sorted_inds[:10]:  # top 10
        result.append({
            "industry": industry,
            "total": round(ind_total, 2),
            "pct": round(ind_total / total * 100, 1) if total else 0,
        })
    return result


# ── DuckDB setup ─────────────────────────────────────────────────────────────

def _csv_path(name: str, cycle: int | None = None) -> Path:
    if cycle:
        return DATA_PROCESSED_FEC / f"{name}_{cycle}.csv"
    return DATA_PROCESSED_FEC / f"{name}.csv"


def _register_csvs(conn, cycle: int) -> None:
    """Register local FEC CSVs as DuckDB views for the given cycle."""
    files = {
        "candidates":     _csv_path("candidates", cycle),
        "cand_summary":   _csv_path("candidate_summaries", cycle),
        "indiv":          _csv_path("individual_contributions", cycle),
        "pac":            _csv_path("pac_to_candidate", cycle),
        "ie":             _csv_path("independent_expenditures", cycle),
        "committees":     _csv_path("committees"),
    }
    for name, path in files.items():
        if not path.exists():
            log.warning("CSV not found: %s — creating empty view", path)
            # Create an empty table so queries don't fail
            if name == "candidates":
                conn.execute(f"CREATE VIEW {name} AS SELECT '' as cand_id, '' as cand_pcc WHERE false")
            elif name == "cand_summary":
                conn.execute(f"CREATE VIEW {name} AS SELECT '' as cand_id, 0.0 as ttl_receipts, 0.0 as ttl_indiv_contrib, 0.0 as other_pol_cmte_contrib WHERE false")
            elif name == "indiv":
                conn.execute(f"CREATE VIEW {name} AS SELECT '' as cmte_id, '' as state, 0.0 as transaction_amt WHERE false")
            elif name == "pac":
                conn.execute(f"CREATE VIEW {name} AS SELECT '' as cmte_id, '' as cand_id, 0.0 as transaction_amt WHERE false")
            elif name == "ie":
                conn.execute(f"CREATE VIEW {name} AS SELECT '' as cmte_id, '' as cand_id, '' as sup_opp, 0.0 as transaction_amt WHERE false")
            elif name == "committees":
                conn.execute(f"CREATE VIEW {name} AS SELECT '' as cmte_id, '' as cmte_nm, '' as cand_id, '' as connected_org_nm WHERE false")
            continue
        conn.execute(
            f"CREATE VIEW {name} AS SELECT * FROM read_csv('{path}', delim='|', header=true, ignore_errors=true)"
        )


def _build_mappings(conn, legislators: dict[str, dict]) -> None:
    """Build fec_map and cmte_to_bioguide temp tables in DuckDB."""
    # Insert legislator fec_id mappings
    fec_rows = []
    for bioguide_id, leg in legislators.items():
        state = leg.get("state", "")
        for fec_id in (leg.get("fec_ids") or []):
            fec_rows.append((bioguide_id, fec_id, state))

    conn.execute("CREATE TABLE fec_map (bioguide_id TEXT, fec_id TEXT, state TEXT)")
    if fec_rows:
        conn.executemany("INSERT INTO fec_map VALUES (?, ?, ?)", fec_rows)

    # Build cmte_to_bioguide by chaining: fec_id → cand_pcc, fec_id → committees.cand_id
    conn.execute("""
        CREATE TABLE cmte_to_bioguide AS
        SELECT DISTINCT c.cand_pcc AS cmte_id, f.bioguide_id
        FROM candidates c
        JOIN fec_map f ON c.cand_id = f.fec_id
        WHERE c.cand_pcc IS NOT NULL AND c.cand_pcc != ''
        UNION
        SELECT DISTINCT cm.cmte_id, f.bioguide_id
        FROM committees cm
        JOIN fec_map f ON cm.cand_id = f.fec_id
        WHERE cm.cand_id IS NOT NULL AND cm.cand_id != ''
    """)

    count = conn.execute("SELECT COUNT(*) FROM cmte_to_bioguide").fetchone()[0]
    log.info("Committee → bioguide map: %d entries", count)


# ── Aggregation queries ──────────────────────────────────────────────────────

def _fetch_pac_totals(conn) -> dict[str, float]:
    """PAC direct contribution totals per bioguide_id."""
    rows = conn.execute("""
        SELECT m.bioguide_id, SUM(CAST(p.transaction_amt AS DOUBLE)) AS total
        FROM pac p
        JOIN cmte_to_bioguide m ON p.cmte_id = m.cmte_id
        GROUP BY m.bioguide_id
    """).fetchall()
    return {r[0]: r[1] for r in rows}


def _fetch_candidate_totals(conn) -> dict[str, dict]:
    """FEC-reported candidate financial totals per bioguide_id (from webl file)."""
    rows = conn.execute("""
        SELECT f.bioguide_id,
               SUM(CAST(cs.ttl_receipts AS DOUBLE)) AS ttl_receipts,
               SUM(CAST(cs.ttl_indiv_contrib AS DOUBLE)) AS ttl_indiv_contrib,
               SUM(CAST(cs.other_pol_cmte_contrib AS DOUBLE)) AS other_pol_cmte_contrib,
               SUM(CAST(cs.pol_pty_contrib AS DOUBLE)) AS pol_pty_contrib,
               SUM(CAST(cs.cand_contrib AS DOUBLE)) AS cand_contrib
        FROM cand_summary cs
        JOIN fec_map f ON cs.cand_id = f.fec_id
        GROUP BY f.bioguide_id
    """).fetchall()
    return {
        r[0]: {
            "ttl_receipts": r[1] or 0.0,
            "ttl_indiv_contrib": r[2] or 0.0,
            "other_pol_cmte_contrib": r[3] or 0.0,
            "pol_pty_contrib": r[4] or 0.0,
            "cand_contrib": r[5] or 0.0,
        }
        for r in rows
    }


def _fetch_ie_totals(conn) -> dict[str, dict]:
    """Super PAC IE for/against totals per bioguide_id."""
    rows = conn.execute("""
        SELECT f.bioguide_id,
               SUM(CASE WHEN ie.sup_opp = 'S' THEN CAST(ie.transaction_amt AS DOUBLE) ELSE 0 END) AS ie_for,
               SUM(CASE WHEN ie.sup_opp = 'O' THEN CAST(ie.transaction_amt AS DOUBLE) ELSE 0 END) AS ie_against
        FROM ie
        JOIN fec_map f ON ie.cand_id = f.fec_id
        GROUP BY f.bioguide_id
    """).fetchall()
    return {r[0]: {"superpac_ie_for": r[1], "superpac_ie_against": r[2]} for r in rows}


def _fetch_individual_totals(conn) -> dict[str, dict]:
    """Individual contribution totals per bioguide_id (large donor, geographic)."""
    rows = conn.execute(f"""
        SELECT
            m.bioguide_id,
            SUM(CASE WHEN CAST(i.transaction_amt AS DOUBLE) >= {LARGE_DONOR_THRESHOLD}
                THEN CAST(i.transaction_amt AS DOUBLE) ELSE 0 END) AS large_donor_total,
            SUM(CASE WHEN UPPER(i.state) = 'DC'
                THEN CAST(i.transaction_amt AS DOUBLE) ELSE 0 END) AS dc_donor_total,
            SUM(CASE WHEN UPPER(i.state) != 'DC' AND UPPER(i.state) = fm.state
                THEN CAST(i.transaction_amt AS DOUBLE) ELSE 0 END) AS in_state_total,
            SUM(CASE WHEN UPPER(i.state) != 'DC' AND (UPPER(i.state) != fm.state OR i.state IS NULL)
                THEN CAST(i.transaction_amt AS DOUBLE) ELSE 0 END) AS out_of_state_total
        FROM indiv i
        JOIN cmte_to_bioguide m ON i.cmte_id = m.cmte_id
        JOIN fec_map fm ON m.bioguide_id = fm.bioguide_id
        GROUP BY m.bioguide_id
    """).fetchall()
    return {
        r[0]: {
            "large_donor_total": r[1],
            "dc_donor_total": r[2],
            "in_state_total": r[3],
            "out_of_state_total": r[4],
        }
        for r in rows
    }


def _fetch_industry_data(conn) -> list[tuple]:
    """PAC contributions grouped by bioguide_id + connected_org_nm + cmte_nm for industry classification."""
    return conn.execute("""
        SELECT m.bioguide_id, cm.connected_org_nm, cm.cmte_nm,
               SUM(CAST(p.transaction_amt AS DOUBLE)) AS total
        FROM pac p
        JOIN cmte_to_bioguide m ON p.cmte_id = m.cmte_id
        JOIN committees cm ON p.cmte_id = cm.cmte_id
        GROUP BY m.bioguide_id, cm.connected_org_nm, cm.cmte_nm
    """).fetchall()


def _classify_industry_totals(industry_data: list[tuple]) -> dict[str, dict[str, float]]:
    """Apply Python-side industry keyword classification."""

    result: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for bioguide_id, org_name, cmte_nm, total in industry_data:
        industry = classify_industry(org_name, cmte_nm)
        result[bioguide_id][industry] += total
    return {bid: dict(ind_map) for bid, ind_map in result.items()}


# ── Top PACs computation ─────────────────────────────────────────────────────

def _compute_top_pacs(conn, cycle: int) -> list[dict]:
    """Compute top PACs per legislator by combining direct + IE support."""
    rows = conn.execute(f"""
        WITH pac_support AS (
            SELECT m.bioguide_id, p.cmte_id,
                   SUM(CAST(p.transaction_amt AS DOUBLE)) AS direct_contribution
            FROM pac p
            JOIN cmte_to_bioguide m ON p.cmte_id = m.cmte_id
            GROUP BY m.bioguide_id, p.cmte_id
        ),
        ie_support AS (
            SELECT f.bioguide_id, ie.cmte_id,
                   SUM(CASE WHEN ie.sup_opp = 'S' THEN CAST(ie.transaction_amt AS DOUBLE) ELSE 0 END) AS ie_for,
                   SUM(CASE WHEN ie.sup_opp = 'O' THEN CAST(ie.transaction_amt AS DOUBLE) ELSE 0 END) AS ie_against
            FROM ie
            JOIN fec_map f ON ie.cand_id = f.fec_id
            GROUP BY f.bioguide_id, ie.cmte_id
        ),
        combined AS (
            SELECT
                COALESCE(p.bioguide_id, i.bioguide_id) AS bioguide_id,
                COALESCE(p.cmte_id, i.cmte_id) AS cmte_id,
                COALESCE(p.direct_contribution, 0) AS direct_contribution,
                COALESCE(i.ie_for, 0) AS ie_for,
                COALESCE(i.ie_against, 0) AS ie_against,
                COALESCE(p.direct_contribution, 0) + COALESCE(i.ie_for, 0) AS total_support
            FROM pac_support p
            FULL OUTER JOIN ie_support i
                ON p.bioguide_id = i.bioguide_id AND p.cmte_id = i.cmte_id
        ),
        ranked AS (
            SELECT c.*, cm.cmte_nm, cm.connected_org_nm,
                   ROW_NUMBER() OVER (PARTITION BY c.bioguide_id ORDER BY c.total_support DESC) AS rank
            FROM combined c
            LEFT JOIN committees cm ON c.cmte_id = cm.cmte_id
            WHERE c.total_support > 0
        )
        SELECT * FROM ranked WHERE rank <= {TOP_PACS_LIMIT}
    """).fetchall()

    # Get column names
    desc = conn.description
    col_names = [d[0] for d in desc] if desc else []

    result = []
    for row in rows:
        row_dict = dict(zip(col_names, row))
        result.append({
            "bioguide_id":         row_dict["bioguide_id"],
            "cycle":               cycle,
            "cmte_id":             row_dict["cmte_id"],
            "cmte_name":           row_dict.get("cmte_nm"),
            "connected_org":       row_dict.get("connected_org_nm"),
            "industry":            classify_industry(row_dict.get("connected_org_nm"), row_dict.get("cmte_nm")),
            "direct_contribution": round(row_dict.get("direct_contribution", 0), 2),
            "ie_for":              round(row_dict.get("ie_for", 0), 2),
            "ie_against":          round(row_dict.get("ie_against", 0), 2),
            "total_support":       round(row_dict.get("total_support", 0), 2),
            "rank":                row_dict.get("rank"),
        })
    return result


# ── Top Contributors computation (OpenSecrets-style) ─────────────────────────

def _to_title_case(s: str) -> str:
    """Convert ALL-CAPS org name to Title Case, preserving short words."""
    if not s:
        return s
    words = s.lower().split()
    small = {"of", "the", "and", "for", "in", "on", "at", "to", "a", "an"}
    result = []
    for i, w in enumerate(words):
        result.append(w if (i > 0 and w in small) else w.capitalize())
    return " ".join(result)


def _compute_top_contributors(conn, cycle: int) -> list[dict]:
    """Compute top contributors per legislator by combining individual employee
    donations (grouped by employer) with PAC contributions (grouped by connected org).
    Matches the OpenSecrets 'Top Contributors' format."""

    # Build exclusion list for SQL
    non_emp_list = ", ".join(f"'{v}'" for v in NON_EMPLOYERS)

    rows = conn.execute(f"""
        WITH indiv_by_employer AS (
            SELECT m.bioguide_id,
                   regexp_replace(UPPER(TRIM(i.employer)), '\s+', ' ', 'g') AS org_name,
                   SUM(CAST(i.transaction_amt AS DOUBLE)) AS individual_total
            FROM indiv i
            JOIN cmte_to_bioguide m ON i.cmte_id = m.cmte_id
            WHERE i.employer IS NOT NULL
              AND TRIM(i.employer) != ''
              AND UPPER(TRIM(i.employer)) NOT IN ({non_emp_list})
            GROUP BY m.bioguide_id, regexp_replace(UPPER(TRIM(i.employer)), '\s+', ' ', 'g')
        ),
        pac_direct_by_org AS (
            SELECT f.bioguide_id,
                   regexp_replace(UPPER(TRIM(
                       COALESCE(NULLIF(TRIM(cm.connected_org_nm), ''), cm.cmte_nm)
                   )), '\s+', ' ', 'g') AS org_name,
                   SUM(CAST(p.transaction_amt AS DOUBLE)) AS amt,
                   ARG_MAX(p.cmte_id, CAST(p.transaction_amt AS DOUBLE)) AS top_cmte_id
            FROM pac p
            JOIN fec_map f ON p.cand_id = f.fec_id
            JOIN committees cm ON p.cmte_id = cm.cmte_id
            WHERE COALESCE(NULLIF(TRIM(cm.connected_org_nm), ''), cm.cmte_nm) IS NOT NULL
            GROUP BY f.bioguide_id, regexp_replace(UPPER(TRIM(
                COALESCE(NULLIF(TRIM(cm.connected_org_nm), ''), cm.cmte_nm)
            )), '\s+', ' ', 'g')
        ),
        ie_by_org AS (
            SELECT f.bioguide_id,
                   regexp_replace(UPPER(TRIM(
                       COALESCE(NULLIF(TRIM(cm.connected_org_nm), ''), cm.cmte_nm)
                   )), '\s+', ' ', 'g') AS org_name,
                   SUM(CASE WHEN ie.sup_opp = 'S'
                       THEN CAST(ie.transaction_amt AS DOUBLE) ELSE 0 END) AS amt,
                   ARG_MAX(ie.cmte_id, CAST(ie.transaction_amt AS DOUBLE)) AS top_cmte_id
            FROM ie
            JOIN fec_map f ON ie.cand_id = f.fec_id
            JOIN committees cm ON ie.cmte_id = cm.cmte_id
            WHERE COALESCE(NULLIF(TRIM(cm.connected_org_nm), ''), cm.cmte_nm) IS NOT NULL
            GROUP BY f.bioguide_id, regexp_replace(UPPER(TRIM(
                COALESCE(NULLIF(TRIM(cm.connected_org_nm), ''), cm.cmte_nm)
            )), '\s+', ' ', 'g')
        ),
        pac_by_org AS (
            SELECT
                COALESCE(d.bioguide_id, e.bioguide_id) AS bioguide_id,
                COALESCE(d.org_name, e.org_name) AS org_name,
                COALESCE(d.amt, 0) + COALESCE(e.amt, 0) AS pac_total,
                COALESCE(d.top_cmte_id, e.top_cmte_id) AS top_cmte_id
            FROM pac_direct_by_org d
            FULL OUTER JOIN ie_by_org e
                ON d.bioguide_id = e.bioguide_id AND d.org_name = e.org_name
        ),
        combined AS (
            SELECT
                COALESCE(i.bioguide_id, p.bioguide_id) AS bioguide_id,
                COALESCE(i.org_name, p.org_name) AS org_name,
                COALESCE(i.individual_total, 0) AS individual_total,
                COALESCE(p.pac_total, 0) AS pac_total,
                COALESCE(i.individual_total, 0) + COALESCE(p.pac_total, 0) AS grand_total,
                p.top_cmte_id AS cmte_id
            FROM indiv_by_employer i
            FULL OUTER JOIN pac_by_org p
                ON i.bioguide_id = p.bioguide_id AND i.org_name = p.org_name
            WHERE COALESCE(i.org_name, p.org_name) IS NOT NULL
              AND COALESCE(i.org_name, p.org_name) != ''
              AND COALESCE(i.org_name, p.org_name) NOT IN ({non_emp_list})
        ),
        ranked AS (
            SELECT *,
                   ROW_NUMBER() OVER (
                       PARTITION BY bioguide_id ORDER BY grand_total DESC
                   ) AS rank
            FROM combined
            WHERE grand_total > 0
        )
        SELECT * FROM ranked WHERE rank <= {TOP_CONTRIBUTORS_LIMIT}
    """).fetchall()

    desc = conn.description
    col_names = [d[0] for d in desc] if desc else []

    # Deduplicate by (bioguide_id, org_name) after title-casing — title-casing
    # can collapse distinct UPPER strings (e.g. punctuation variants)
    merged: dict[tuple[str, str], dict] = {}
    for row in rows:
        row_dict = dict(zip(col_names, row))
        raw_org = row_dict["org_name"]
        org_name = _to_title_case(raw_org or "")
        if not org_name or org_name.upper() in NON_EMPLOYERS:
            continue
        bio_id = row_dict["bioguide_id"]
        key = (bio_id, org_name)
        indiv = round(row_dict.get("individual_total", 0), 2)
        pac = round(row_dict.get("pac_total", 0), 2)
        cmte_id = row_dict.get("cmte_id")
        if key in merged:
            merged[key]["individual_total"] += indiv
            merged[key]["pac_total"] += pac
            merged[key]["grand_total"] += indiv + pac
            # Keep cmte_id from the entry with PAC data if current has none
            if cmte_id and not merged[key].get("cmte_id"):
                merged[key]["cmte_id"] = cmte_id
        else:
            merged[key] = {
                "bioguide_id":      bio_id,
                "cycle":            cycle,
                "org_name":         org_name,
                "individual_total": indiv,
                "pac_total":        pac,
                "grand_total":      round(indiv + pac, 2),
                "rank":             row_dict.get("rank"),
                "cmte_id":          cmte_id,
            }

    # Re-rank after dedup

    by_legislator: dict[str, list[dict]] = defaultdict(list)
    for entry in merged.values():
        by_legislator[entry["bioguide_id"]].append(entry)

    result = []
    for bio_id, entries in by_legislator.items():
        entries.sort(key=lambda e: e["grand_total"], reverse=True)
        for rank, entry in enumerate(entries[:TOP_CONTRIBUTORS_LIMIT], 1):
            entry["rank"] = rank
            result.append(entry)

    return result


# ── Committee name lookup ────────────────────────────────────────────────────

def _upsert_cmte_names(conn) -> int:
    """Populate fec_cmte_names lookup table from local committees.csv via DuckDB."""
    rows = conn.execute("""
        SELECT DISTINCT cmte_id, cmte_nm, connected_org_nm
        FROM committees
        WHERE cmte_id IS NOT NULL AND cmte_id != ''
          AND cmte_nm IS NOT NULL AND cmte_nm != ''
    """).fetchall()

    records = [
        {
            "cmte_id": r[0].strip(),
            "cmte_name": r[1].strip(),
            "connected_org": r[2].strip() if r[2] and r[2].strip() else None,
        }
        for r in rows
    ]

    log.info("Upserting %d committee names to fec_cmte_names…", len(records))
    for chunk in batch(records, UPSERT_BATCH):
        upsert("fec_cmte_names", chunk)

    return len(records)


# ── Summary assembly ──────────────────────────────────────────────────────────

def compute_cycle(cycle: int) -> dict[str, int]:
    """Compute and upsert legislator_funding_summary + legislator_top_pacs for one cycle."""
    log.info("--- Computing funding summaries for cycle %d ---", cycle)

    legislators = load_legislators()

    with duckdb_connect() as conn:
        _register_csvs(conn, cycle)
        _build_mappings(conn, legislators)

        log.info("Upserting committee names…")
        cmte_names_count = _upsert_cmte_names(conn)

        log.info("Fetching candidate financial totals (webl)…")
        cand_totals = _fetch_candidate_totals(conn)

        log.info("Fetching PAC contributions…")
        pac_totals = _fetch_pac_totals(conn)

        log.info("Fetching independent expenditure totals…")
        ie_totals = _fetch_ie_totals(conn)

        log.info("Fetching individual contribution totals…")
        indiv_totals = _fetch_individual_totals(conn)

        log.info("Fetching industry data…")
        industry_data = _fetch_industry_data(conn)
        industry_totals = _classify_industry_totals(industry_data)

        log.info("Computing top PACs…")
        top_pacs_rows = _compute_top_pacs(conn, cycle)

        log.info("Computing top contributors…")
        top_contributors_rows = _compute_top_contributors(conn, cycle)

    # ── Build funding summary rows ───────────────────────────────────────────
    rows: list[dict] = []
    all_bioguide_ids = set(pac_totals) | set(ie_totals) | set(indiv_totals) | set(cand_totals)

    for bioguide_id in all_bioguide_ids:
        pac_total = pac_totals.get(bioguide_id, 0.0)
        ie = ie_totals.get(bioguide_id, {})
        indiv = indiv_totals.get(bioguide_id, {})
        ind_sums = industry_totals.get(bioguide_id, {})
        fec_totals = cand_totals.get(bioguide_id, {})

        large_donor = indiv.get("large_donor_total", 0.0)
        in_state = indiv.get("in_state_total", 0.0)
        out_of_state = indiv.get("out_of_state_total", 0.0)
        dc_total = indiv.get("dc_donor_total", 0.0)

        ie_for = ie.get("superpac_ie_for", 0.0)
        ie_against = ie.get("superpac_ie_against", 0.0)

        # Use FEC-reported total_receipts from webl; fall back to sum of known sources
        fec_receipts = fec_totals.get("ttl_receipts", 0.0)
        total_receipts = fec_receipts if fec_receipts else (pac_total + large_donor)

        # Small donor = FEC total individual contributions minus itemized large donors
        fec_indiv = fec_totals.get("ttl_indiv_contrib", 0.0)
        small_donor = max(0.0, fec_indiv - large_donor) if fec_indiv else None

        # PAC % uses FEC-reported other_pol_cmte_contrib for accuracy
        fec_pac = fec_totals.get("other_pol_cmte_contrib", 0.0)
        pac_for_pct = fec_pac if fec_pac else pac_total

        # Party contributions and self-funding from webl
        fec_party = fec_totals.get("pol_pty_contrib", 0.0)
        fec_self = fec_totals.get("cand_contrib", 0.0)

        # Other = remainder so all categories sum to total_receipts
        known_sources = pac_for_pct + large_donor + (small_donor or 0.0) + fec_party + fec_self
        other_total = max(0.0, total_receipts - known_sources) if total_receipts else 0.0

        rows.append({
            "bioguide_id":         bioguide_id,
            "cycle":               cycle,
            "total_receipts":      round(total_receipts, 2),
            "pac_direct_total":    round(pac_for_pct, 2),
            "pac_direct_pct":      round(pac_for_pct / total_receipts * 100, 1) if total_receipts else 0.0,
            "superpac_ie_for":     round(ie_for, 2),
            "superpac_ie_against": round(ie_against, 2),
            "large_donor_total":   round(large_donor, 2),
            "large_donor_pct":     round(large_donor / total_receipts * 100, 1) if total_receipts else 0.0,
            "small_donor_total":   round(small_donor, 2) if small_donor is not None else None,
            "small_donor_pct":     round(small_donor / total_receipts * 100, 1) if (total_receipts and small_donor is not None) else None,
            "pol_pty_total":       round(fec_party, 2),
            "pol_pty_pct":         round(fec_party / total_receipts * 100, 1) if total_receipts else 0.0,
            "self_funded_total":   round(fec_self, 2),
            "self_funded_pct":     round(fec_self / total_receipts * 100, 1) if total_receipts else 0.0,
            "other_total":         round(other_total, 2),
            "other_pct":           round(other_total / total_receipts * 100, 1) if total_receipts else 0.0,
            "in_state_total":      round(in_state, 2),
            "out_of_state_total":  round(out_of_state, 2),
            "out_of_state_pct":    round(out_of_state / (in_state + out_of_state) * 100, 1) if (in_state + out_of_state) else 0.0,
            "dc_donor_total":      round(dc_total, 2),
            "top_industries":      build_top_industries(ind_sums, pac_total),
        })

    # ── Upsert funding summaries ─────────────────────────────────────────────
    log.info("Upserting %d funding summary rows for cycle %d…", len(rows), cycle)
    for chunk in batch(rows, UPSERT_BATCH):
        upsert("legislator_funding_summary", chunk)

    # ── Upsert top PACs ──────────────────────────────────────────────────────
    log.info("Upserting %d top PAC rows for cycle %d…", len(top_pacs_rows), cycle)
    for chunk in batch(top_pacs_rows, UPSERT_BATCH):
        upsert("legislator_top_pacs", chunk)

    # ── Upsert top contributors ─────────────────────────────────────────────
    log.info("Upserting %d top contributor rows for cycle %d…", len(top_contributors_rows), cycle)
    for chunk in batch(top_contributors_rows, UPSERT_BATCH):
        upsert("legislator_top_contributors", chunk)

    return {"funding_summary": len(rows), "top_pacs": len(top_pacs_rows), "top_contributors": len(top_contributors_rows), "cmte_names": cmte_names_count}


def run(cycles: list[int]) -> None:
    run_id = log_run_start(SCRIPT)
    total_summary = 0
    total_pacs = 0
    total_contributors = 0
    total_cmte_names = 0

    try:
        for cycle in cycles:
            counts = compute_cycle(cycle)
            total_summary += counts["funding_summary"]
            total_pacs += counts["top_pacs"]
            total_contributors += counts["top_contributors"]
            total_cmte_names = max(total_cmte_names, counts["cmte_names"])
            log.info("Cycle %d: %d summary, %d top PAC, %d top contributor rows",
                     cycle, counts["funding_summary"], counts["top_pacs"], counts["top_contributors"])

        log.info("Done. Total: %d funding summary, %d top PAC, %d top contributor, %d cmte name rows",
                 total_summary, total_pacs, total_contributors, total_cmte_names)
        log_run_end(run_id, "success", {
            "total_summary_rows": total_summary,
            "total_top_pacs_rows": total_pacs,
            "total_top_contributors_rows": total_contributors,
            "total_cmte_names": total_cmte_names,
            "cycles": cycles,
        })

    except Exception as e:
        log.exception("compute_funding_summaries failed")
        log_run_end(run_id, "failed", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute legislator_funding_summary + legislator_top_pacs from local FEC CSVs")
    parser.add_argument(
        "--cycles", type=int, nargs="+", default=FEC_CYCLES,
        help=f"FEC cycles to compute (default: {FEC_CYCLES})"
    )
    args = parser.parse_args()
    run(cycles=args.cycles)
