"""Tier 1d: Address standardization + geocoding."""
import time
from pathlib import Path

import httpx
import structlog

from pipeline.shared.db import upsert
from pipeline.shared.parquet import duckdb_connect

log = structlog.get_logger()

MODEL_VERSION = "address_std_v1_usaddress"
CENSUS_GEOCODE_URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"


def parse_address(address_str: str) -> dict:
    result = {"street": "", "city": "", "state": "", "zip5": "", "zip4": ""}
    if not address_str or not address_str.strip():
        return result
    try:
        import usaddress
        tagged, addr_type = usaddress.tag(address_str)
        street_parts = []
        for key in ["AddressNumber", "StreetNamePreDirectional", "StreetName",
                     "StreetNamePostType", "StreetNamePostDirectional",
                     "OccupancyType", "OccupancyIdentifier"]:
            if key in tagged:
                street_parts.append(tagged[key])
        result["street"] = " ".join(street_parts)
        result["city"] = tagged.get("PlaceName", "")
        result["state"] = tagged.get("StateName", "")
        zip_code = tagged.get("ZipCode", "")
        if zip_code:
            result["zip5"] = zip_code[:5]
            if len(zip_code) > 5:
                result["zip4"] = zip_code[5:9].lstrip("-")
    except Exception:
        pass
    return result


def normalize_address(row: dict) -> dict:
    zip_code = str(row.get("zip_code") or "").strip()
    zip5 = zip_code[:5] if len(zip_code) >= 5 else zip_code
    zip4 = zip_code[5:9].lstrip("-") if len(zip_code) > 5 else ""
    sub_id = row.get("sub_id")
    try:
        contribution_id = int(sub_id) if sub_id else None
    except (ValueError, TypeError):
        contribution_id = None
    return {
        "contribution_id": contribution_id,
        "street": "",
        "city": str(row.get("city") or "").strip(),
        "state": str(row.get("state") or "").strip(),
        "zip5": zip5,
        "zip4": zip4,
        "lat": None,
        "lon": None,
        "geocode_confidence": None,
        "model_version": MODEL_VERSION,
    }


def batch_geocode(addresses: list[dict], batch_size: int = 1000, delay: float = 1.0) -> list[dict]:
    if not addresses:
        return []
    results = list(addresses)
    for i in range(0, len(addresses), batch_size):
        batch = addresses[i:i + batch_size]
        lines = []
        for j, addr in enumerate(batch):
            street = addr.get("street", "")
            city = addr.get("city", "")
            state = addr.get("state", "")
            zip5 = addr.get("zip5", "")
            lines.append(f"{j},{street},{city},{state},{zip5}")
        csv_content = "\n".join(lines)
        try:
            resp = httpx.post(
                CENSUS_GEOCODE_URL,
                data={"benchmark": "Public_AR_Current", "vintage": "Current_Current"},
                files={"addressFile": ("addresses.csv", csv_content, "text/csv")},
                timeout=120,
            )
            resp.raise_for_status()
            for line in resp.text.strip().split("\n"):
                parts = line.split('","')
                if len(parts) < 8:
                    continue
                try:
                    idx = int(parts[0].strip('"'))
                    match_type = parts[2].strip('"') if len(parts) > 2 else ""
                    lon_str = parts[5].strip('"') if len(parts) > 5 else ""
                    lat_str = parts[6].strip('"') if len(parts) > 6 else ""
                    actual_idx = i + idx
                    if actual_idx < len(results) and match_type in ("Exact", "Non_Exact"):
                        results[actual_idx]["lat"] = float(lat_str) if lat_str else None
                        results[actual_idx]["lon"] = float(lon_str) if lon_str else None
                        results[actual_idx]["geocode_confidence"] = 0.95 if match_type == "Exact" else 0.7
                except (ValueError, IndexError):
                    continue
        except Exception as e:
            log.warning("geocode_batch_failed", error=str(e), batch_start=i)
        if i + batch_size < len(addresses):
            time.sleep(delay)
    geocoded = sum(1 for r in results if r.get("lat") is not None)
    log.info("geocoding_complete", total=len(results), geocoded=geocoded)
    return results


def run_address_standardization(parquet_path: Path, geocode: bool = True) -> int:
    with duckdb_connect() as conn:
        df = conn.execute(f"""
            SELECT sub_id, city, state, zip_code
            FROM read_parquet('{parquet_path}')
            WHERE (city IS NOT NULL AND city != '')
               OR (state IS NOT NULL AND state != '')
               OR (zip_code IS NOT NULL AND zip_code != '')
        """).fetchdf()
    log.info("addresses_to_normalize", count=len(df))
    rows = []
    for _, record in df.iterrows():
        row = normalize_address(record.to_dict())
        if row["contribution_id"] is not None:
            rows.append(row)
    log.info("addresses_normalized", count=len(rows))
    if geocode and rows:
        rows = batch_geocode(rows)
    total = upsert("donor_address_normalized", rows, schema="enrichment")
    log.info("address_standardization_complete", rows=total)
    return total
