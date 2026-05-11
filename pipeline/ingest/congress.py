"""Wrap usc-run to fetch bill and vote data."""
import json
import subprocess
from pathlib import Path
from typing import Generator

import structlog

log = structlog.get_logger()


def setup(data_dir: Path) -> Path:
    """Clone usc-run repo if not present. Returns repo path (absolute)."""
    repo_dir = (data_dir / "congress-scraper").resolve()
    if (repo_dir / ".git").exists():
        log.info("usc_run_repo_exists", path=str(repo_dir))
    else:
        log.info("cloning_usc_run")
        subprocess.run(
            ["git", "clone", "--depth=1", "https://github.com/unitedstates/congress.git", str(repo_dir)],
            check=True,
        )
        subprocess.run(["python3", "-m", "venv", str(repo_dir / "env")], check=True)
        subprocess.run(
            [str(repo_dir / "env" / "bin" / "pip"), "install", "-e", str(repo_dir)],
            check=True,
        )
    return repo_dir


def run_bills(repo_dir: Path, congress: int, force: bool = False) -> None:
    cmd = [str(repo_dir / "env" / "bin" / "usc-run"), "bills", f"--congress={congress}", "--log=info"]
    if force:
        cmd.append("--force")
    log.info("usc_run_bills", congress=congress, force=force)
    subprocess.run(cmd, cwd=str(repo_dir), check=True)


def run_votes(repo_dir: Path, congress: int, force: bool = False) -> None:
    cmd = [str(repo_dir / "env" / "bin" / "usc-run"), "votes", f"--congress={congress}", "--log=info"]
    if force:
        cmd.append("--force")
    log.info("usc_run_votes", congress=congress, force=force)
    subprocess.run(cmd, cwd=str(repo_dir), check=True)


def iter_bill_jsons(repo_dir: Path, congress: int) -> Generator[dict, None, None]:
    data_dir = repo_dir / "data" / str(congress) / "bills"
    if not data_dir.exists():
        log.warning("no_bill_data", path=str(data_dir))
        return
    count = 0
    for bill_type_dir in sorted(data_dir.iterdir()):
        if not bill_type_dir.is_dir():
            continue
        for bill_dir in sorted(bill_type_dir.iterdir()):
            json_path = bill_dir / "data.json"
            if json_path.exists():
                with open(json_path) as f:
                    yield json.load(f)
                count += 1
    log.info("iterated_bill_jsons", congress=congress, count=count)


def iter_vote_jsons(repo_dir: Path, congress: int) -> Generator[dict, None, None]:
    data_dir = repo_dir / "data" / str(congress) / "votes"
    if not data_dir.exists():
        log.warning("no_vote_data", path=str(data_dir))
        return
    count = 0
    for session_dir in sorted(data_dir.iterdir()):
        if not session_dir.is_dir():
            continue
        for vote_dir in sorted(session_dir.iterdir()):
            json_path = vote_dir / "data.json"
            if json_path.exists():
                with open(json_path) as f:
                    yield json.load(f)
                count += 1
    log.info("iterated_vote_jsons", congress=congress, count=count)
