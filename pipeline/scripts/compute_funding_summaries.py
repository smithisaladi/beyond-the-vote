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

def classify_industry(org_name: str | None) -> str:
    if not org_name:
        return "Other"
    lower = org_name.lower()
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
    """PAC contributions grouped by bioguide_id + connected_org_nm for industry classification."""
    return conn.execute("""
        SELECT m.bioguide_id, cm.connected_org_nm, SUM(CAST(p.transaction_amt AS DOUBLE)) AS total
        FROM pac p
        JOIN cmte_to_bioguide m ON p.cmte_id = m.cmte_id
        JOIN committees cm ON p.cmte_id = cm.cmte_id
        GROUP BY m.bioguide_id, cm.connected_org_nm
    """).fetchall()


def _classify_industry_totals(industry_data: list[tuple]) -> dict[str, dict[str, float]]:
    """Apply Python-side industry keyword classification."""
    from collections import defaultdict
    result: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for bioguide_id, org_name, total in industry_data:
        industry = classify_industry(org_name)
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
            "industry":            classify_industry(row_dict.get("connected_org_nm")),
            "direct_contribution": round(row_dict.get("direct_contribution", 0), 2) or None,
            "ie_for":              round(row_dict.get("ie_for", 0), 2) or None,
            "ie_against":          round(row_dict.get("ie_against", 0), 2) or None,
            "total_support":       round(row_dict.get("total_support", 0), 2) or None,
            "rank":                row_dict.get("rank"),
        })
    return result


# ── Summary assembly ──────────────────────────────────────────────────────────

def compute_cycle(cycle: int) -> dict[str, int]:
    """Compute and upsert legislator_funding_summary + legislator_top_pacs for one cycle."""
    log.info("--- Computing funding summaries for cycle %d ---", cycle)

    legislators = load_legislators()

    with duckdb_connect() as conn:
        _register_csvs(conn, cycle)
        _build_mappings(conn, legislators)

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

    # ── Build funding summary rows ───────────────────────────────────────────
    rows: list[dict] = []
    all_bioguide_ids = set(pac_totals) | set(ie_totals) | set(indiv_totals)

    for bioguide_id in all_bioguide_ids:
        pac_total = pac_totals.get(bioguide_id, 0.0)
        ie = ie_totals.get(bioguide_id, {})
        indiv = indiv_totals.get(bioguide_id, {})
        ind_sums = industry_totals.get(bioguide_id, {})

        large_donor = indiv.get("large_donor_total", 0.0)
        in_state = indiv.get("in_state_total", 0.0)
        out_of_state = indiv.get("out_of_state_total", 0.0)
        dc_total = indiv.get("dc_donor_total", 0.0)

        # total_receipts = PAC direct + large individual (conservative from itemized data)
        total_receipts = pac_total + large_donor
        small_donor = max(0.0, total_receipts - pac_total - large_donor)

        rows.append({
            "bioguide_id":         bioguide_id,
            "cycle":               cycle,
            "total_receipts":      round(total_receipts, 2) if total_receipts else None,
            "pac_direct_total":    round(pac_total, 2) if pac_total else None,
            "pac_direct_pct":      round(pac_total / total_receipts * 100, 1) if total_receipts else None,
            "superpac_ie_for":     round(ie.get("superpac_ie_for", 0), 2) or None,
            "superpac_ie_against": round(ie.get("superpac_ie_against", 0), 2) or None,
            "large_donor_total":   round(large_donor, 2) if large_donor else None,
            "large_donor_pct":     round(large_donor / total_receipts * 100, 1) if total_receipts else None,
            "small_donor_total":   round(small_donor, 2) if small_donor else None,
            "small_donor_pct":     round(small_donor / total_receipts * 100, 1) if total_receipts else None,
            "in_state_total":      round(in_state, 2) if in_state else None,
            "out_of_state_total":  round(out_of_state, 2) if out_of_state else None,
            "out_of_state_pct":    round(out_of_state / (in_state + out_of_state) * 100, 1) if (in_state + out_of_state) else None,
            "dc_donor_total":      round(dc_total, 2) if dc_total else None,
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

    return {"funding_summary": len(rows), "top_pacs": len(top_pacs_rows)}


def run(cycles: list[int]) -> None:
    run_id = log_run_start(SCRIPT)
    total_summary = 0
    total_pacs = 0

    try:
        for cycle in cycles:
            counts = compute_cycle(cycle)
            total_summary += counts["funding_summary"]
            total_pacs += counts["top_pacs"]
            log.info("Cycle %d: %d summary rows, %d top PAC rows", cycle, counts["funding_summary"], counts["top_pacs"])

        log.info("Done. Total: %d funding summary rows, %d top PAC rows", total_summary, total_pacs)
        log_run_end(run_id, "success", {
            "total_summary_rows": total_summary,
            "total_top_pacs_rows": total_pacs,
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
