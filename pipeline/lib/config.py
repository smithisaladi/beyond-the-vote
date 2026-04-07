"""
Central configuration for all pipeline scripts.

Tuneable constants live here instead of being scattered as magic numbers.
Runtime overrides (API keys, per-run flags) still come from environment variables.
"""

# ── API base URLs ──────────────────────────────────────────────────────────────
CONGRESS_BASE = "https://api.congress.gov/v3"
FEC_BASE = "https://api.open.fec.gov/v1"

# ── External data URLs ─────────────────────────────────────────────────────────
LEGISLATORS_URL = "https://unitedstates.github.io/congress-legislators/legislators-current.json"
COMMITTEES_URL = "https://unitedstates.github.io/congress-legislators/committees-current.json"
COMMITTEE_MEMBERSHIP_URL = "https://unitedstates.github.io/congress-legislators/committee-membership-current.json"
VOTEVIEW_MEMBERS_URL = "https://voteview.com/static/data/out/members/HS119_members.csv"

# ── Congress defaults ──────────────────────────────────────────────────────────
DEFAULT_CONGRESS = 119

# ── HTTP timeouts (seconds) ────────────────────────────────────────────────────
TIMEOUT_DEFAULT = 30.0   # general fetches
TIMEOUT_SHORT = 15.0     # vote XML, house roll call members
TIMEOUT_FAST = 10.0      # govinfo.gov bill text, quick lookups

# ── Rate limiting (seconds between requests) ───────────────────────────────────
# Congress.gov: 5,000 req/hr → min 0.72s; 0.75s gives ~4,800/hr with headroom
RATE_LIMIT_CONGRESS = 0.75
# OpenFEC standard key: 1,000 req/hr → min 3.6s.
# Email APIinfo@fec.gov for a 7,200/hr key, which drops this to 0.5s.
RATE_LIMIT_FEC = 4.0
# GovInfo: 40 req/s / 1,200/min / 36,000/hr → 0.2s (5 req/s) is well within limits
RATE_LIMIT_GOVINFO = 0.2
# Anthropic: generous Haiku limits; 0.2s is safe
RATE_LIMIT_LLM = 0.2
# Backoff after a failed request; set ≥ RATE_LIMIT_FEC to cover the slowest API
RATE_LIMIT_ERROR = 5.0

# ── Pagination / batch sizes ───────────────────────────────────────────────────
PAGE_SIZE_BILLS = 250          # Congress.gov API max page size
PAGE_SIZE_VOTES = 250          # Congress.gov API max page size (was 20)
PAGE_SIZE_FEC = 100            # OpenFEC schedules API per_page (documented max)
PAGE_SIZE_HOUSE_MEMBERS = 500  # house roll call members API limit
UPSERT_BATCH_SIZE = 50         # DB upsert batch size
BILLS_OFFSET_LIMIT = 5000      # max pagination offset for bills query (~20 pages × 250)

# ── Sync defaults (overridable via env vars in scripts) ───────────────────────
MAX_BILLS_DEFAULT = 2000       # SYNC_BILLS_MAX
LOOKBACK_DAYS_VOTES = 7        # LOOKBACK_DAYS for vote sync
LOOKBACK_DAYS_ALIGNMENTS = 30  # --days default for donor alignment sync

# ── Text processing ────────────────────────────────────────────────────────────
SUMMARY_MAX_CHARS = 2000
TITLE_MAX_CHARS = 1000

# ── Donor analysis ─────────────────────────────────────────────────────────────
TOP_DONORS_COUNT = 10   # top donors stored per legislator
TOP_DONORS_PROMPT = 8   # donors included in LLM alignment prompt

# ── LLM settings ──────────────────────────────────────────────────────────────
LLM_MODEL = "claude-haiku-4-5"
LLM_MAX_TOKENS_PROFILE = 150   # interest profile generation
LLM_MAX_TOKENS_ALIGNMENT = 800  # vote-donor alignment analysis
