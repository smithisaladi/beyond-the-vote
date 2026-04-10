"""
compute_leaderboard_cache.py — Pre-compute the contributor leaderboard from
local FEC CSVs via DuckDB and store it in contributor_leaderboard_cache for
fast API queries.

Must be run AFTER bulk_import_fec.py has written the local FEC CSVs.
Re-running is safe — rows are fully replaced (upserted) each time.

Usage:
    python scripts/compute_leaderboard_cache.py
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import DATA_PROCESSED_FEC, FEC_CYCLES, UPSERT_BATCH
from load import log_run_end, log_run_start
from utils import batch, duckdb_connect, get_supabase

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

SCRIPT = "compute_leaderboard_cache"

SKIP_NAMES = {
    "ACTBLUE", "WINRED",
    "DEMOCRATIC SENATORIAL CAMPAIGN COMMITTEE", "DSCC",
    "DEMOCRATIC CONGRESSIONAL CAMPAIGN COMMITTEE", "DCCC",
    "NRSC", "NRCC",
    "NATIONAL REPUBLICAN SENATORIAL COMMITTEE",
    "NATIONAL REPUBLICAN CONGRESSIONAL COMMITTEE",
    "DEMOCRATIC NATIONAL COMMITTEE", "DNC",
    "REPUBLICAN NATIONAL COMMITTEE", "RNC",
    "SENATE MAJORITY PAC", "HOUSE MAJORITY PAC",
    "SENATE LEADERSHIP FUND", "CONGRESSIONAL LEADERSHIP FUND",
    "EMILY'S LIST", "END CITIZENS UNITED",
}


def _csv_path(name: str, cycle: int | None = None) -> Path:
    if cycle:
        return DATA_PROCESSED_FEC / f"{name}_{cycle}.csv"
    return DATA_PROCESSED_FEC / f"{name}.csv"


def _register_csvs(conn, cycle: int) -> None:
    """Register per-cycle CSVs as views named pac_{cycle} and ie_{cycle}."""
    pac_path = _csv_path("pac_to_candidate", cycle)
    ie_path  = _csv_path("independent_expenditures", cycle)

    if pac_path.exists():
        conn.execute(f"CREATE VIEW pac_{cycle} AS SELECT * FROM read_csv('{pac_path}', delim='|', header=true, ignore_errors=true)")
    else:
        log.warning("CSV not found: %s — empty view", pac_path)
        conn.execute(f"CREATE VIEW pac_{cycle} AS SELECT '' as cmte_id, '' as cand_id, 0.0 as transaction_amt WHERE false")

    if ie_path.exists():
        conn.execute(f"CREATE VIEW ie_{cycle} AS SELECT * FROM read_csv('{ie_path}', delim='|', header=true, ignore_errors=true)")
    else:
        log.warning("CSV not found: %s — empty view", ie_path)
        conn.execute(f"CREATE VIEW ie_{cycle} AS SELECT '' as cmte_id, '' as cand_id, '' as sup_opp, 0.0 as transaction_amt WHERE false")


def _build_fec_map(conn, legislators: dict) -> None:
    """Create fec_map table mapping fec_id → bioguide_id."""
    fec_rows = [
        (bioguide_id, fec_id)
        for bioguide_id, leg in legislators.items()
        for fec_id in (leg.get("fec_ids") or [])
    ]
    conn.execute("CREATE TABLE fec_map (bioguide_id TEXT, fec_id TEXT)")
    if fec_rows:
        conn.executemany("INSERT INTO fec_map VALUES (?, ?)", fec_rows)
    log.info("fec_map: %d entries", len(fec_rows))


def compute_leaderboard(cycles: list[int]) -> list[dict]:
    """
    Aggregate PAC direct contributions and independent expenditures by committee,
    scoped to committees that funded known legislators.
    Returns a list of row dicts ready to upsert.
    """
    db = get_supabase()

    # Load legislators (small table — fetch all at once)
    legislators: dict[str, dict] = {}
    offset = 0
    while True:
        res = db.table("legislators").select("bioguide_id,full_name,party,state,chamber,fec_ids").range(offset, offset + 999).execute()
        for row in res.data:
            legislators[row["bioguide_id"]] = row
        if len(res.data) < 1000:
            break
        offset += 1000
    log.info("Loaded %d legislators", len(legislators))

    with duckdb_connect() as conn:
        for cycle in cycles:
            _register_csvs(conn, cycle)

        # Register committees CSV once (shared across cycles)
        cmte_path = _csv_path("committees")
        if cmte_path.exists():
            conn.execute(f"CREATE VIEW committees AS SELECT * FROM read_csv('{cmte_path}', delim='|', header=true, ignore_errors=true)")
        else:
            conn.execute("CREATE VIEW committees AS SELECT '' as cmte_id, '' as cmte_nm WHERE false")

        _build_fec_map(conn, legislators)

        known_sql = "SELECT DISTINCT fec_id AS cand_id FROM fec_map"
        conn.execute(f"CREATE TABLE known_cands AS {known_sql}")

        union_pac = " UNION ALL ".join(
            f"SELECT cmte_id, cand_id, CAST(transaction_amt AS DOUBLE) AS amt FROM pac_{c}"
            for c in cycles
        )
        union_ie = " UNION ALL ".join(
            f"SELECT cmte_id, cand_id, sup_opp, CAST(transaction_amt AS DOUBLE) AS amt FROM ie_{c}"
            for c in cycles
        )

        conn.execute(f"""
            CREATE TABLE direct AS
            SELECT cmte_id, cand_id, SUM(amt) AS direct_amt
            FROM ({union_pac})
            WHERE cand_id IN (SELECT cand_id FROM known_cands)
            GROUP BY cmte_id, cand_id
        """)

        conn.execute(f"""
            CREATE TABLE ies AS
            SELECT cmte_id, cand_id,
                   SUM(CASE WHEN UPPER(sup_opp) = 'S' THEN amt ELSE 0 END) AS ie_for,
                   SUM(CASE WHEN UPPER(sup_opp) = 'O' THEN amt ELSE 0 END) AS ie_against
            FROM ({union_ie})
            WHERE cand_id IN (SELECT cand_id FROM known_cands)
            GROUP BY cmte_id, cand_id
        """)

        conn.execute("""
            CREATE TABLE combined AS
            SELECT
                COALESCE(d.cmte_id, i.cmte_id) AS cmte_id,
                COALESCE(d.cand_id, i.cand_id) AS cand_id,
                COALESCE(d.direct_amt, 0)       AS direct_amt,
                COALESCE(i.ie_for, 0)           AS ie_for,
                COALESCE(i.ie_against, 0)       AS ie_against,
                COALESCE(d.direct_amt, 0) + COALESCE(i.ie_for, 0) AS total_support
            FROM direct d
            FULL OUTER JOIN ies i ON d.cmte_id = i.cmte_id AND d.cand_id = i.cand_id
        """)

        conn.execute("""
            CREATE TABLE agg AS
            SELECT
                cmte_id,
                SUM(direct_amt)    AS direct_total,
                SUM(ie_for)        AS ie_for_total,
                SUM(ie_against)    AS ie_against_total,
                SUM(total_support) AS total_contributions,
                COUNT(DISTINCT cand_id) FILTER (WHERE total_support > 0) AS recipient_count
            FROM combined
            GROUP BY cmte_id
        """)

        # Resolve committee names from the committees CSV
        conn.execute("""
            CREATE TABLE named AS
            SELECT
                a.cmte_id,
                COALESCE(NULLIF(TRIM(c.cmte_nm), ''), a.cmte_id) AS cmte_name,
                a.direct_total,
                a.ie_for_total,
                a.ie_against_total,
                a.total_contributions,
                a.recipient_count
            FROM agg a
            LEFT JOIN committees c ON a.cmte_id = c.cmte_id
        """)

        agg_rows = conn.execute("""
            SELECT cmte_id, cmte_name, direct_total, ie_for_total,
                   ie_against_total, total_contributions, recipient_count
            FROM named
            WHERE total_contributions > 0
            ORDER BY total_contributions DESC
        """).fetchall()

        log.info("Aggregated %d committees", len(agg_rows))

        # Per-committee: top 5 recipient legislators
        top_recipients_map: dict[str, list] = {}
        per_cand = conn.execute("""
            SELECT c.cmte_id, m.bioguide_id, c.direct_amt, c.ie_for, c.total_support
            FROM combined c
            JOIN fec_map m ON c.cand_id = m.fec_id
            WHERE c.total_support > 0
        """).fetchall()

        for cmte_id, bioguide_id, direct_amt, ie_for, total_support in per_cand:
            top_recipients_map.setdefault(cmte_id, []).append({
                "bioguide_id": bioguide_id,
                "direct":      float(direct_amt or 0),
                "ie_for":      float(ie_for or 0),
                "amount":      float(total_support or 0),
            })

        # Enrich with legislator name/party/state/chamber
        leg_info = {bid: leg for bid, leg in legislators.items()}

        result = []
        for row in agg_rows:
            cmte_id, cmte_name, direct_total, ie_for_total, ie_against_total, total_contributions, recipient_count = row

            # Skip pass-through committees
            if cmte_name.upper().strip() in SKIP_NAMES:
                continue

            recipients = sorted(
                top_recipients_map.get(cmte_id, []),
                key=lambda x: x["amount"],
                reverse=True,
            )[:5]

            enriched = []
            for r in recipients:
                leg = leg_info.get(r["bioguide_id"], {})
                enriched.append({
                    "bioguide_id": r["bioguide_id"],
                    "name":        leg.get("full_name", r["bioguide_id"]),
                    "party":       leg.get("party", ""),
                    "state":       leg.get("state", ""),
                    "chamber":     leg.get("chamber", ""),
                    "amount":      r["amount"],
                    "direct":      r["direct"],
                    "ie_for":      r["ie_for"],
                })

            result.append({
                "cmte_id":             cmte_id,
                "cmte_name":           cmte_name,
                "direct_total":        float(direct_total or 0),
                "ie_for_total":        float(ie_for_total or 0),
                "ie_against_total":    float(ie_against_total or 0),
                "total_contributions": float(total_contributions or 0),
                "recipient_count":     int(recipient_count or 0),
                "top_recipients":      enriched,
            })

    log.info("Leaderboard: %d committees after filtering", len(result))
    return result


def main() -> None:
    run_id = log_run_start(SCRIPT)
    try:
        rows = compute_leaderboard(FEC_CYCLES)

        db = get_supabase()

        # Clear existing cache then insert fresh
        db.table("contributor_leaderboard_cache").delete().neq("cmte_id", "").execute()
        log.info("Cleared existing cache rows")

        stored = 0
        for chunk in batch(rows, UPSERT_BATCH):
            db.table("contributor_leaderboard_cache").insert(chunk).execute()
            stored += len(chunk)
            log.info("Inserted %d/%d rows", stored, len(rows))

        log_run_end(run_id, "success", result={"rows_written": stored})
        log.info("Done — %d rows in contributor_leaderboard_cache", stored)
    except Exception as exc:
        log.exception("compute_leaderboard_cache failed")
        log_run_end(run_id, "failed", error=str(exc))
        sys.exit(1)


if __name__ == "__main__":
    main()
