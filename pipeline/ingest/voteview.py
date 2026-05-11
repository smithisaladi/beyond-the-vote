"""Download VoteView NOMINATE scores."""
import csv
from pathlib import Path
import httpx
import structlog

log = structlog.get_logger()
MEMBERS_URL = "https://voteview.com/static/data/out/members/HSall_members.csv"

def download_scores(data_dir: Path) -> Path:
    dest = data_dir / "voteview" / "members.csv"
    dest.parent.mkdir(parents=True, exist_ok=True)
    log.info("downloading_voteview_scores")
    resp = httpx.get(MEMBERS_URL, follow_redirects=True, timeout=120)
    resp.raise_for_status()
    dest.write_text(resp.text)
    log.info("voteview_scores_downloaded", path=str(dest))
    return dest

def parse_scores(csv_path: Path) -> list[dict]:
    rows = []
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    log.info("voteview_scores_parsed", count=len(rows))
    return rows
