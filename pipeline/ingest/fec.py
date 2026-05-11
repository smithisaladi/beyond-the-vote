"""Download FEC bulk files and convert to Parquet."""
import os
import zipfile
from pathlib import Path
import httpx
import structlog
from pipeline.shared.parquet import csv_to_parquet

log = structlog.get_logger()

FEC_BULK_BASE = "https://www.fec.gov/files/bulk-downloads"
FEC_CYCLES = [2024, 2026]

PAS2_COLS = ["cmte_id", "amndt_ind", "rpt_tp", "transaction_pgi", "image_num", "transaction_tp", "entity_tp", "name", "city", "state", "zip_code", "employer", "occupation", "transaction_dt", "transaction_amt", "other_id", "cand_id", "tran_id", "file_num", "memo_cd", "memo_text", "sub_id"]
INDIV_COLS = ["cmte_id", "amndt_ind", "rpt_tp", "transaction_pgi", "image_num", "transaction_tp", "entity_tp", "name", "city", "state", "zip_code", "employer", "occupation", "transaction_dt", "transaction_amt", "other_id", "tran_id", "file_num", "memo_cd", "memo_text", "sub_id"]
CM_COLS = ["cmte_id", "cmte_nm", "tres_nm", "cmte_st1", "cmte_st2", "cmte_city", "cmte_st", "cmte_zip", "cmte_dsgn", "cmte_tp", "cmte_pty_affiliation", "cmte_filing_freq", "org_tp", "connected_org_nm", "cand_id"]

def download_fec_file(cycle: int, file_type: str, dest_dir: Path) -> Path:
    yy = str(cycle)[-2:]
    filename = f"{file_type}{yy}.zip"
    url = f"{FEC_BULK_BASE}/{cycle}/{filename}"
    zip_path = dest_dir / filename
    txt_path = dest_dir / f"{file_type}{yy}.txt"
    if txt_path.exists():
        log.info("fec_file_exists", path=str(txt_path))
        return txt_path
    log.info("downloading_fec_file", url=url)
    dest_dir.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, follow_redirects=True, timeout=300) as resp:
        resp.raise_for_status()
        with open(zip_path, "wb") as f:
            for chunk in resp.iter_bytes(chunk_size=8192):
                f.write(chunk)
    with zipfile.ZipFile(zip_path) as zf:
        txt_files = [n for n in zf.namelist() if n.endswith(".txt")]
        if not txt_files:
            raise FileNotFoundError(f"No .txt in {zip_path}")
        zf.extract(txt_files[0], dest_dir)
        extracted = dest_dir / txt_files[0]
        if extracted != txt_path:
            extracted.rename(txt_path)
    zip_path.unlink()
    log.info("fec_file_extracted", path=str(txt_path))
    return txt_path

def convert_to_parquet(txt_path: Path, parquet_path: Path, columns: list[str]) -> int:
    if parquet_path.exists():
        log.info("parquet_exists", path=str(parquet_path))
        from pipeline.shared.parquet import duckdb_connect
        with duckdb_connect() as conn:
            return conn.execute(f"SELECT count(*) FROM read_parquet('{parquet_path}')").fetchone()[0]
    return csv_to_parquet(txt_path, parquet_path, delimiter="|", columns=columns, header=False)

def download_and_convert_cycle(cycle: int, data_dir: Path) -> dict[str, Path]:
    fec_dir = data_dir / "fec" / str(cycle)
    fec_dir.mkdir(parents=True, exist_ok=True)
    results = {}
    for file_type, cols in [("pas2", PAS2_COLS), ("indiv", INDIV_COLS), ("cm", CM_COLS)]:
        txt_path = download_fec_file(cycle, file_type, fec_dir)
        parquet_path = fec_dir / f"{file_type}.parquet"
        convert_to_parquet(txt_path, parquet_path, cols)
        results[file_type] = parquet_path
    return results
