"""Git-sync congress-legislators YAML files."""
import subprocess
from pathlib import Path

import yaml
import structlog

log = structlog.get_logger()

REPO_URL = "https://github.com/unitedstates/congress-legislators.git"
CURRENT_FILE = "legislators-current.yaml"
HISTORICAL_FILE = "legislators-historical.yaml"
COMMITTEES_FILE = "committee-membership-current.yaml"
COMMITTEES_CURRENT_FILE = "committees-current.yaml"


def sync(data_dir: Path) -> Path:
    """Clone or pull congress-legislators into data_dir/legislators/. Returns repo path."""
    repo_dir = data_dir / "legislators"
    if (repo_dir / ".git").exists():
        log.info("git_pull", path=str(repo_dir))
        subprocess.run(["git", "-C", str(repo_dir), "pull", "--ff-only"], check=True)
    else:
        log.info("git_clone", url=REPO_URL, path=str(repo_dir))
        subprocess.run(["git", "clone", "--depth=1", REPO_URL, str(repo_dir)], check=True)
    return repo_dir


def load_current(repo_dir: Path) -> list[dict]:
    path = repo_dir / CURRENT_FILE
    with open(path) as f:
        data = yaml.safe_load(f)
    log.info("loaded_current_legislators", count=len(data))
    return data


def load_historical(repo_dir: Path) -> list[dict]:
    path = repo_dir / HISTORICAL_FILE
    with open(path) as f:
        data = yaml.safe_load(f)
    log.info("loaded_historical_legislators", count=len(data))
    return data


def load_committees(repo_dir: Path) -> list[dict]:
    path = repo_dir / COMMITTEES_CURRENT_FILE
    with open(path) as f:
        data = yaml.safe_load(f)
    log.info("loaded_committees", count=len(data))
    return data


def load_committee_memberships(repo_dir: Path) -> dict[str, list[dict]]:
    path = repo_dir / COMMITTEES_FILE
    with open(path) as f:
        data = yaml.safe_load(f)
    log.info("loaded_committee_memberships", committees=len(data))
    return data
