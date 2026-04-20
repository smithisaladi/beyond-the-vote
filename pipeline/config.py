"""
Pipeline configuration — constants, FEC column definitions, industry keyword mapping.
"""

import os
from datetime import date
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).parent
DATA_RAW = ROOT / "data" / "raw"
DATA_PROCESSED = ROOT / "data" / "processed"
DATA_PROCESSED_FEC = DATA_PROCESSED / "fec"

# ── FEC Cycles ─────────────────────────────────────────────────────────────────

FEC_CYCLES = [2024, 2026]

FEC_CYCLE_CONGRESS = {
    2024: 118,
    2026: 119,
}

# A cycle is "active" if its election year is in the future (or current year).
# Active cycles get fresh re-downloads; historical cycles use cached zips.
def is_active_cycle(cycle: int) -> bool:
    return date.today().year <= cycle


# ── Batch / chunk sizes ────────────────────────────────────────────────────────

CHUNK_SIZE = 50_000       # rows per chunk when streaming large FEC files
UPSERT_BATCH = 500        # rows per Supabase upsert call
BILL_PAGE_SIZE = 250      # congress.gov pagination limit
API_RATE_LIMIT = 950      # req/hour safe threshold (limit is 1000)

# ── API base URLs ──────────────────────────────────────────────────────────────

CONGRESS_API_BASE = "https://api.congress.gov/v3"
SENATE_VOTE_INDEX = "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_{congress}_{session}.xml"
SENATE_VOTE_URL   = "https://www.senate.gov/legislative/LIS/roll_call_votes/vote{congress}{session}/vote_{congress}_{session}_{number:05d}.xml"

LEGISLATORS_CURRENT_URL  = "https://unitedstates.github.io/congress-legislators/legislators-current.yaml"
LEGISLATORS_HISTORICAL_URL = "https://unitedstates.github.io/congress-legislators/legislators-historical.yaml"

# ── FEC Column Definitions ─────────────────────────────────────────────────────
# FEC bulk files have NO header row — column positions match the FEC data dictionary.

CN_COLS = [
    "cand_id", "cand_name", "cand_pty_affiliation", "cand_election_yr",
    "cand_office_st", "cand_office", "cand_office_district", "cand_ici",
    "cand_status", "cand_pcc", "cand_st1", "cand_st2", "cand_city",
    "cand_st", "cand_zip",
]

CM_COLS = [
    "cmte_id", "cmte_nm", "tres_nm", "cmte_st1", "cmte_st2", "cmte_city",
    "cmte_st", "cmte_zip", "cmte_dsgn", "cmte_tp", "cmte_pty_affiliation",
    "cmte_filing_freq", "org_tp", "connected_org_nm", "cand_id",
]

CCL_COLS = [
    "cand_id", "cand_election_yr", "fec_election_yr", "cmte_id",
    "cmte_tp", "cmte_dsgn", "linkage_id",
]

INDIV_COLS = [
    "cmte_id", "amndt_ind", "rpt_tp", "transaction_pgi", "image_num",
    "transaction_tp", "entity_tp", "name", "city", "state", "zip_code",
    "employer", "occupation", "transaction_dt", "transaction_amt",
    "other_id", "tran_id", "file_num", "memo_cd", "memo_text", "sub_id",
]

PAS2_COLS = [
    "cmte_id", "amndt_ind", "rpt_tp", "transaction_pgi", "image_num",
    "transaction_tp", "entity_tp", "name", "city", "state", "zip_code",
    "employer", "occupation", "transaction_dt", "transaction_amt",
    "other_id", "cand_id", "tran_id", "file_num", "memo_cd", "memo_text",
    "sub_id",
]

# FEC candidate financial summary (webl{yy}.txt — all candidates, no header row)
WEBL_COLS = [
    "cand_id", "cand_name", "cand_ici", "pty_cd", "cand_pty_affiliation",
    "ttl_receipts", "trans_from_auth", "ttl_disb", "trans_to_auth",
    "coh_bop", "coh_cop", "cand_contrib", "cand_loans", "other_loans",
    "cand_loan_repay", "other_loan_repay", "debts_owed_by",
    "ttl_indiv_contrib", "cand_office_st", "cand_office_district",
    "spec_election", "prim_election", "run_election", "gen_election",
    "gen_election_pct",
    "other_pol_cmte_contrib", "pol_pty_contrib", "cvg_end_dt",
    "indiv_refunds", "cmte_refunds",
]

# FEC committee financial summary (webk{yy}.txt — all committees, no header row)
WEBK_COLS = [
    "cmte_id", "cmte_nm", "cmte_tp", "cmte_dsgn", "cmte_filing_freq",
    "ttl_receipts", "trans_from_aff", "indv_contrib",
    "other_pol_cmte_contrib", "cand_contrib", "cand_loans",
    "ttl_loans_received", "ttl_disb", "tranf_to_aff", "indv_refunds",
    "other_pol_cmte_refunds", "cand_loan_repay", "ttl_loan_repay",
    "debts_owed_by", "ttl_contrib", "trans_from_nonfed_acct",
    "trans_from_nonfed_levin", "ttl_nonfed_trans", "cand_id",
    "ind_exp", "pty_coord_exp", "cvg_end_dt",
]

# ── CSV output column names (match transform output schemas) ─────────────────
# Used by append_csv and DuckDB reads.

CANDIDATES_CSV_COLS = [
    "cand_id", "cand_name", "cand_pty_affiliation", "cand_election_yr",
    "cand_office_st", "cand_office", "cand_office_district", "cand_ici",
    "cand_status", "cand_pcc", "cycle",
]

COMMITTEES_CSV_COLS = [
    "cmte_id", "cmte_nm", "cmte_dsgn", "cmte_tp", "cmte_pty_affiliation",
    "cmte_filing_freq", "org_tp", "connected_org_nm", "cand_id",
]

INDIV_CSV_COLS = [
    "sub_id", "cmte_id", "name", "city", "state", "zip_code",
    "employer", "occupation", "transaction_dt", "transaction_amt", "cycle",
]

PAC_CSV_COLS = [
    "sub_id", "cmte_id", "cand_id", "transaction_tp",
    "transaction_amt", "transaction_dt", "cycle",
]

IE_CSV_COLS = [
    "sub_id", "cmte_id", "cand_id", "sup_opp", "transaction_tp",
    "transaction_amt", "transaction_dt", "cycle",
]

CAND_SUMMARY_CSV_COLS = [
    "cand_id", "cand_name", "ttl_receipts", "ttl_indiv_contrib",
    "other_pol_cmte_contrib", "pol_pty_contrib", "cand_contrib",
    "cand_office_st", "cand_office_district", "cycle",
]

# ── FEC Committee Type Codes ───────────────────────────────────────────────────

PAC_COMMITTEE_TYPES = {"Q", "N", "V", "W"}   # direct contribution eligible
SUPERPAC_COMMITTEE_TYPES = {"O", "U"}         # independent expenditure only

# pas2 transaction type codes
PAC_DIRECT_TPS = {"24K", "24Z"}
IE_FOR_TP      = "24E"   # independent expenditure FOR candidate
IE_AGAINST_TP  = "24A"   # independent expenditure AGAINST candidate

# ── Congress session → year mapping ───────────────────────────────────────────

CONGRESS_SESSIONS = {
    (118, 1): 2023,
    (118, 2): 2024,
    (119, 1): 2025,
    (119, 2): 2026,
}

# ── DW-NOMINATE chamber codes ─────────────────────────────────────────────────

VOTEVIEW_CHAMBER = {
    100: "Senate",
    200: "House",
}

# ── Bill status heuristics ────────────────────────────────────────────────────
# Applied to latestAction.text (case-insensitive substring match).

BILL_STATUS_RULES = [
    ("became public law",      "Passed"),
    ("signed by president",    "Passed"),
    ("enacted",                "Passed"),
    ("passed the senate",      "Passed"),
    ("passed the house",       "Passed"),
    ("presented to president", "Passed"),
    ("failed",                 "Failed"),
    ("defeated",               "Failed"),
    ("vetoed",                 "Failed"),
    ("rejected",               "Failed"),
    ("referred to",            "Committee"),
    ("committee",              "Committee"),
    ("tabled",                 "Stalled"),
    ("postponed indefinitely", "Stalled"),
]

# ── Topic slug mapping ────────────────────────────────────────────────────────
# Maps congress.gov subject strings → app topic slugs.

TOPIC_SLUG_MAP = {
    "agriculture and food":        "agriculture",
    "animals":                     "environment",
    "armed forces and national security": "defense",
    "arts, culture, religion":     "culture",
    "civil rights and liberties":  "law",
    "commerce":                    "economy",
    "crime and law enforcement":   "criminal-justice",
    "economics and public finance": "economy",
    "education":                   "education",
    "emergency management":        "emergency-management",
    "energy":                      "energy",
    "environmental protection":    "climate-environment",
    "families":                    "social-policy",
    "finance and financial sector": "economy",
    "foreign trade and international finance": "trade",
    "government operations and politics": "government",
    "health":                      "healthcare",
    "housing and community development": "housing",
    "immigration":                 "immigration",
    "international affairs":       "foreign-policy",
    "labor and employment":        "labor",
    "law":                         "law",
    "native americans":            "indigenous-rights",
    "public lands and natural resources": "climate-environment",
    "science, technology, communications": "technology",
    "social welfare":              "social-policy",
    "sports and recreation":       "culture",
    "taxation":                    "taxes",
    "transportation and public works": "transportation",
    "water resources development": "climate-environment",
}

# ── FEC Organization Type → Category ─────────────────────────────────────────
# Based on the FEC `org_tp` field in the committee master file.
# See: https://www.fec.gov/campaign-finance-data/committee-type-code-descriptions/

ORG_TYPE_LABELS: dict[str, str] = {
    "C": "Corporate",
    "L": "Labor",
    "M": "Membership Organization",
    "T": "Trade Association",
    "V": "Cooperative",
    "W": "Corporate (Non-Stock)",
}

# Committee type → category for committees without org_tp
CMTE_TYPE_LABELS: dict[str, str] = {
    "O": "Super PAC",
    "U": "Super PAC",
    "D": "Leadership PAC",
    "X": "Party Committee",
    "Y": "Party Committee",
}

# Committee designation codes
CMTE_DSGN_LABELS: dict[str, str] = {
    "D": "Leadership PAC",
}
