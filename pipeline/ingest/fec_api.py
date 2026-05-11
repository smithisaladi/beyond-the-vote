"""FEC API (OpenFEC) client for incremental data sync.

Uses date-based filtering to fetch only new/updated records since last sync.
Rate limit: 1000 req/hour with API key.

Endpoints used:
- /v1/schedules/schedule_a/ — Individual contributions (itemized receipts)
- /v1/schedules/schedule_e/ — Independent expenditures
- /v1/committee/ — Committee details
- /v1/candidates/ — Candidate info

Docs: https://api.open.fec.gov/developers/
"""
import os
import time
from datetime import datetime, timedelta, timezone

import httpx
import structlog

log = structlog.get_logger()

BASE_URL = "https://api.open.fec.gov/v1"
RATE_LIMIT = 950  # requests per hour (hard limit is 1000)
_request_count = 0
_window_start = time.time()


def _get_api_key() -> str:
    key = os.environ.get("FEC_API_KEY", "")
    if not key:
        raise ValueError("FEC_API_KEY environment variable required. Get one at https://api.data.gov/signup/")
    return key


def _rate_limited_get(url: str, params: dict, timeout: int = 30) -> dict | None:
    """Make a rate-limited GET request to the FEC API."""
    global _request_count, _window_start

    # Reset counter every hour
    if time.time() - _window_start > 3600:
        _request_count = 0
        _window_start = time.time()

    # Wait if approaching rate limit
    if _request_count >= RATE_LIMIT:
        sleep_time = 3600 - (time.time() - _window_start) + 5
        if sleep_time > 0:
            log.info("rate_limit_waiting", seconds=round(sleep_time))
            time.sleep(sleep_time)
        _request_count = 0
        _window_start = time.time()

    params["api_key"] = _get_api_key()

    try:
        resp = httpx.get(url, params=params, timeout=timeout, follow_redirects=True)
        _request_count += 1

        if resp.status_code == 429:
            log.warning("rate_limited", retry_after=resp.headers.get("Retry-After", "60"))
            time.sleep(int(resp.headers.get("Retry-After", 60)))
            return _rate_limited_get(url, params, timeout)

        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError as e:
        log.error("fec_api_error", url=url, error=str(e))
        return None


def fetch_pac_contributions(
    since_date: str | None = None,
    two_year_transaction_period: int = 2026,
    per_page: int = 100,
    max_pages: int = 1000,
) -> list[dict]:
    """Fetch PAC-to-candidate contributions (Schedule A, transaction types 24K/24Z).

    Args:
        since_date: ISO date string (YYYY-MM-DD). Only fetch records after this date.
        two_year_transaction_period: FEC election cycle (e.g., 2026)
        per_page: Results per page (max 100)
        max_pages: Safety limit on pagination

    Returns: List of contribution dicts
    """
    url = f"{BASE_URL}/schedules/schedule_a/"
    params = {
        "two_year_transaction_period": two_year_transaction_period,
        "per_page": per_page,
        "sort": "-contribution_receipt_date",
        "committee_type": ["Q", "N", "V", "W", "O", "U"],  # PAC types
        "is_individual": False,  # Committee contributions only
    }

    if since_date:
        params["min_date"] = since_date

    all_results = []
    last_index = None
    last_date = None

    for page in range(max_pages):
        if last_index:
            params["last_index"] = last_index
            params["last_contribution_receipt_date"] = last_date

        data = _rate_limited_get(url, params)
        if not data:
            break

        results = data.get("results", [])
        if not results:
            break

        all_results.extend(results)
        log.info("pac_contributions_page", page=page + 1, results=len(results), total=len(all_results))

        # Pagination via last_index (FEC's keyset pagination)
        pagination = data.get("pagination", {})
        last_index = pagination.get("last_indexes", {}).get("last_index")
        last_date = pagination.get("last_indexes", {}).get("last_contribution_receipt_date")

        if not last_index or len(results) < per_page:
            break

    log.info("pac_contributions_fetched", total=len(all_results))
    return all_results


def fetch_independent_expenditures(
    since_date: str | None = None,
    cycle: int = 2026,
    per_page: int = 100,
    max_pages: int = 1000,
) -> list[dict]:
    """Fetch independent expenditures (Schedule E).

    Args:
        since_date: ISO date (YYYY-MM-DD). Only fetch records after this date.
        cycle: FEC election cycle
    """
    url = f"{BASE_URL}/schedules/schedule_e/"
    params = {
        "cycle": cycle,
        "per_page": per_page,
        "sort": "-expenditure_date",
    }

    if since_date:
        params["min_date"] = since_date

    all_results = []
    last_index = None
    last_date = None

    for page in range(max_pages):
        if last_index:
            params["last_index"] = last_index
            params["last_expenditure_date"] = last_date

        data = _rate_limited_get(url, params)
        if not data:
            break

        results = data.get("results", [])
        if not results:
            break

        all_results.extend(results)
        log.info("ie_page", page=page + 1, results=len(results), total=len(all_results))

        pagination = data.get("pagination", {})
        last_index = pagination.get("last_indexes", {}).get("last_index")
        last_date = pagination.get("last_indexes", {}).get("last_expenditure_date")

        if not last_index or len(results) < per_page:
            break

    log.info("ie_fetched", total=len(all_results))
    return all_results


def fetch_committees(
    committee_ids: list[str] | None = None,
    per_page: int = 100,
    max_pages: int = 100,
) -> list[dict]:
    """Fetch committee details."""
    url = f"{BASE_URL}/committees/"
    params = {"per_page": per_page}

    if committee_ids:
        # Batch by 10 IDs at a time
        all_results = []
        for i in range(0, len(committee_ids), 10):
            batch_ids = committee_ids[i:i + 10]
            params["committee_id"] = batch_ids
            data = _rate_limited_get(url, params)
            if data:
                all_results.extend(data.get("results", []))
        return all_results

    # Fetch all (paginated)
    all_results = []
    page = 1
    for _ in range(max_pages):
        params["page"] = page
        data = _rate_limited_get(url, params)
        if not data:
            break
        results = data.get("results", [])
        if not results:
            break
        all_results.extend(results)
        if len(results) < per_page:
            break
        page += 1

    return all_results


def fetch_candidate_totals(candidate_ids: list[str], cycle: int = 2026) -> list[dict]:
    """Fetch candidate financial totals from the FEC API.

    Returns pre-computed totals including individual contributions,
    PAC contributions, etc. for each candidate.
    """
    url = f"{BASE_URL}/candidates/totals/"
    all_results = []

    # Batch by 10 candidate IDs at a time
    for i in range(0, len(candidate_ids), 10):
        batch = candidate_ids[i:i + 10]
        params = {
            "candidate_id": batch,
            "cycle": cycle,
            "per_page": 100,
        }
        data = _rate_limited_get(url, params)
        if data:
            all_results.extend(data.get("results", []))

    log.info("candidate_totals_fetched", total=len(all_results), cycle=cycle)
    return all_results


def transform_api_pac_contribution(record: dict, cycle: int) -> dict | None:
    """Transform an OpenFEC Schedule A record to our fec.pac_to_candidate schema."""
    sub_id = record.get("sub_id")
    if not sub_id:
        return None

    cmte_id = record.get("committee_id", "")
    cand_id = record.get("candidate_id")
    amt = record.get("contribution_receipt_amount")
    if not cmte_id or amt is None:
        return None

    # Map FEC transaction types
    tp = record.get("receipt_type", "")
    if tp not in ("24K", "24Z"):
        return None

    receipt_date = record.get("contribution_receipt_date", "")

    return {
        "sub_id": int(sub_id),
        "cmte_id": cmte_id,
        "cand_id": cand_id,
        "transaction_tp": tp,
        "transaction_amt": float(amt),
        "transaction_dt": receipt_date,
        "cycle": cycle,
    }


def transform_api_ie(record: dict, cycle: int) -> dict | None:
    """Transform an OpenFEC Schedule E record to our fec.independent_expenditures schema."""
    sub_id = record.get("sub_id")
    if not sub_id:
        return None

    cmte_id = record.get("committee_id", "")
    cand_id = record.get("candidate_id")
    amt = record.get("expenditure_amount")
    if not cmte_id or amt is None:
        return None

    sup_opp = record.get("support_oppose_indicator", "")
    if sup_opp not in ("S", "O"):
        return None

    exp_date = record.get("expenditure_date", "")
    tp = "24E" if sup_opp == "S" else "24A"

    return {
        "sub_id": int(sub_id),
        "cmte_id": cmte_id,
        "cand_id": cand_id,
        "sup_opp": sup_opp,
        "transaction_tp": tp,
        "transaction_amt": float(amt),
        "transaction_dt": exp_date,
        "cycle": cycle,
    }
