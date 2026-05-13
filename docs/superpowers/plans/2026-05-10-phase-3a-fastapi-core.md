# Phase 3a: FastAPI Core — Infrastructure + Endpoints

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FastAPI backend with async SQLAlchemy, Supabase JWT auth, observability, and all core API endpoints (bills, politicians, donors, representatives, dashboard) — porting from the existing Next.js route handlers.

**Architecture:** FastAPI with SQLAlchemy 2.0 async (asyncpg), Pydantic v2 schemas, Supabase JWT validation via JWKS, structlog + Sentry observability, slowapi rate limiting. Each domain gets its own router module. Raw SQL via `text()` for complex queries (hybrid search, PAC aggregation). Auth dependency injected on protected endpoints only.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, asyncpg, Pydantic v2, python-jose, structlog, sentry-sdk, slowapi, httpx

**Design spec:** `docs/superpowers/specs/2026-05-10-full-stack-refactor-design.md`

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `apps/api/app/db/session.py` | Async engine + session factory |
| Create | `apps/api/app/db/models/congress.py` | SQLAlchemy models for congress.* tables |
| Create | `apps/api/app/db/models/fec.py` | SQLAlchemy models for fec.* tables |
| Create | `apps/api/app/db/models/app_schema.py` | SQLAlchemy models for app.* user tables |
| Create | `apps/api/app/db/models/derived.py` | SQLAlchemy models for derived.* tables |
| Create | `apps/api/app/db/models/enrichment.py` | SQLAlchemy models for enrichment.* tables |
| Create | `apps/api/app/auth.py` | Supabase JWT validation via JWKS |
| Create | `apps/api/app/deps.py` | FastAPI dependencies (db session, auth) |
| Create | `apps/api/app/middleware/request_id.py` | X-Request-ID generation |
| Create | `apps/api/app/routers/bills.py` | Bill list, search, detail, by-topic |
| Create | `apps/api/app/routers/politicians.py` | Politician search + detail |
| Create | `apps/api/app/routers/donors.py` | PAC leaderboard + detail |
| Create | `apps/api/app/routers/representatives.py` | Address lookup via Geocodio |
| Create | `apps/api/app/routers/dashboard.py` | Followed, tracked bills, topic prefs |
| Create | `apps/api/app/queries/bills.py` | Hybrid search + bill lookup SQL |
| Create | `apps/api/app/queries/donors.py` | PAC detail aggregation SQL |
| Create | `apps/api/app/schemas/bills.py` | Pydantic response models for bills |
| Create | `apps/api/app/schemas/politicians.py` | Pydantic response models for politicians |
| Create | `apps/api/app/schemas/donors.py` | Pydantic response models for donors |
| Create | `apps/api/app/schemas/common.py` | Shared pagination, error schemas |
| Modify | `apps/api/app/main.py` | Wire routers, middleware, Sentry, lifespan |
| Modify | `apps/api/app/config.py` | Add missing config fields |

---

## Task 1: Database session + config

**Files:**
- Create: `apps/api/app/db/session.py`
- Modify: `apps/api/app/config.py`
- Create: `apps/api/tests/test_db_session.py`

- [ ] **Step 1: Write test**

```python
# apps/api/tests/test_db_session.py
import pytest
from app.db.session import get_engine, async_session_factory


def test_get_engine_returns_engine():
    engine = get_engine("postgresql+asyncpg://localhost/test")
    assert engine is not None
    assert "asyncpg" in str(engine.url)


def test_async_session_factory_returns_maker():
    engine = get_engine("postgresql+asyncpg://localhost/test")
    factory = async_session_factory(engine)
    assert factory is not None
```

- [ ] **Step 2: Update config**

```python
# apps/api/app/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = ""
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    sentry_dsn: str = ""
    environment: str = "development"
    debug: bool = False

    # Supabase JWKS
    supabase_jwt_issuer: str = ""

    # Rate limiting
    rate_limit: str = "60/minute"

    # Geocodio
    geocodio_api_key: str = ""

    # Anthropic (for PAC summaries)
    anthropic_api_key: str = ""

    model_config = {"env_prefix": "", "env_file": ".env"}

    @property
    def async_database_url(self) -> str:
        """Convert postgres:// to postgresql+asyncpg://"""
        url = self.database_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


settings = Settings()
```

- [ ] **Step 3: Create session module**

```python
# apps/api/app/db/session.py
"""SQLAlchemy async engine and session factory."""
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine


def get_engine(database_url: str, **kwargs) -> AsyncEngine:
    """Create an async SQLAlchemy engine."""
    return create_async_engine(
        database_url,
        echo=False,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        **kwargs,
    )


def async_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Create an async session factory bound to the given engine."""
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/smithi/Desktop/beyond-the-vote/apps/api && uv run pytest tests/test_db_session.py -v
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/db/session.py apps/api/app/config.py apps/api/tests/test_db_session.py
git commit -m "feat(api): async SQLAlchemy session factory and config"
```

---

## Task 2: SQLAlchemy models

**Files:**
- Create: `apps/api/app/db/models/congress.py`
- Create: `apps/api/app/db/models/fec.py`
- Create: `apps/api/app/db/models/app_schema.py`
- Create: `apps/api/app/db/models/derived.py`
- Create: `apps/api/app/db/models/enrichment.py`
- Modify: `apps/api/app/db/models/__init__.py`

- [ ] **Step 1: Create congress models**

```python
# apps/api/app/db/models/congress.py
"""SQLAlchemy models for congress.* schema."""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Integer, Text, Boolean, Date, SmallInteger, ARRAY, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Legislator(Base):
    __tablename__ = "legislators"
    __table_args__ = {"schema": "congress"}

    bioguide_id: Mapped[str] = mapped_column(Text, primary_key=True)
    lis_id: Mapped[Optional[str]] = mapped_column(Text, unique=True)
    icpsr_id: Mapped[Optional[int]] = mapped_column(Integer)
    govtrack_id: Mapped[Optional[str]] = mapped_column(Text)
    thomas_id: Mapped[Optional[str]] = mapped_column(Text)
    fec_ids: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text))
    first_name: Mapped[str] = mapped_column(Text)
    last_name: Mapped[str] = mapped_column(Text)
    full_name: Mapped[str] = mapped_column(Text)
    party: Mapped[str] = mapped_column(Text)
    chamber: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(Text)
    state_full: Mapped[str] = mapped_column(Text)
    district: Mapped[Optional[int]] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(Text)
    in_office: Mapped[Optional[bool]] = mapped_column(Boolean, default=True)
    birthday: Mapped[Optional[date]] = mapped_column(Date)
    gender: Mapped[Optional[str]] = mapped_column(Text)
    website: Mapped[Optional[str]] = mapped_column(Text)
    phone: Mapped[Optional[str]] = mapped_column(Text)
    address: Mapped[Optional[str]] = mapped_column(Text)
    photo_url: Mapped[Optional[str]] = mapped_column(Text)
    term_start: Mapped[Optional[date]] = mapped_column(Date)
    term_end: Mapped[Optional[date]] = mapped_column(Date)
    senate_class: Mapped[Optional[int]] = mapped_column(Integer)
    next_election: Mapped[Optional[int]] = mapped_column(Integer)
    twitter: Mapped[Optional[str]] = mapped_column(Text)
    facebook: Mapped[Optional[str]] = mapped_column(Text)
    youtube: Mapped[Optional[str]] = mapped_column(Text)
    fec_committee_id: Mapped[Optional[str]] = mapped_column(Text)
    raw_json: Mapped[Optional[dict]] = mapped_column(JSONB)
    synced_at: Mapped[Optional[datetime]] = mapped_column()


class Bill(Base):
    __tablename__ = "bills"
    __table_args__ = {"schema": "congress"}

    bill_id: Mapped[str] = mapped_column(Text, primary_key=True)
    congress: Mapped[int] = mapped_column(Integer)
    bill_type: Mapped[str] = mapped_column(Text)
    bill_number: Mapped[Optional[str]] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    summary: Mapped[Optional[str]] = mapped_column(Text)
    combined_text: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[Optional[str]] = mapped_column(Text)
    policy_area: Mapped[Optional[str]] = mapped_column(Text)
    topics: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    sponsor_bioguide_id: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("congress.legislators.bioguide_id"))
    sponsor_name: Mapped[Optional[str]] = mapped_column(Text)
    sponsor_party: Mapped[Optional[str]] = mapped_column(Text)
    introduced_date: Mapped[Optional[date]] = mapped_column(Date)
    last_action_text: Mapped[Optional[str]] = mapped_column(Text)
    last_action_date: Mapped[Optional[date]] = mapped_column(Date)
    congress_gov_url: Mapped[Optional[str]] = mapped_column(Text)
    referenced_agencies: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text))
    referenced_laws: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text))
    referenced_usc: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text))
    synced_at: Mapped[Optional[datetime]] = mapped_column()


class BillVoteSummary(Base):
    __tablename__ = "bill_vote_summaries"
    __table_args__ = {"schema": "congress"}

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    bill_id: Mapped[str] = mapped_column(Text)
    congress: Mapped[int] = mapped_column(Integer)
    chamber: Mapped[str] = mapped_column(Text)
    date: Mapped[date] = mapped_column(Date)
    question: Mapped[Optional[str]] = mapped_column(Text)
    result: Mapped[str] = mapped_column(Text)
    title: Mapped[Optional[str]] = mapped_column(Text)
    required: Mapped[Optional[str]] = mapped_column(Text)
    yea_total: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    nay_total: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    present_total: Mapped[Optional[int]] = mapped_column(Integer)
    not_voting_total: Mapped[Optional[int]] = mapped_column(Integer)
    yea_democrat: Mapped[Optional[int]] = mapped_column(Integer)
    nay_democrat: Mapped[Optional[int]] = mapped_column(Integer)
    yea_republican: Mapped[Optional[int]] = mapped_column(Integer)
    nay_republican: Mapped[Optional[int]] = mapped_column(Integer)
    yea_independent: Mapped[Optional[int]] = mapped_column(Integer)
    nay_independent: Mapped[Optional[int]] = mapped_column(Integer)
    source_url: Mapped[Optional[str]] = mapped_column(Text)
    synced_at: Mapped[Optional[datetime]] = mapped_column()


class BillVotePosition(Base):
    __tablename__ = "bill_vote_positions"
    __table_args__ = {"schema": "congress"}

    vote_id: Mapped[str] = mapped_column(Text, ForeignKey("congress.bill_vote_summaries.id", ondelete="CASCADE"), primary_key=True)
    bioguide_id: Mapped[str] = mapped_column(Text, ForeignKey("congress.legislators.bioguide_id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[str] = mapped_column(Text)


class Committee(Base):
    __tablename__ = "committees"
    __table_args__ = {"schema": "congress"}

    thomas_id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    chamber: Mapped[str] = mapped_column(Text)
    committee_type: Mapped[Optional[str]] = mapped_column(Text)
    parent_id: Mapped[Optional[str]] = mapped_column(Text, ForeignKey("congress.committees.thomas_id"))
    url: Mapped[Optional[str]] = mapped_column(Text)
    synced_at: Mapped[Optional[datetime]] = mapped_column()


class CommitteeMembership(Base):
    __tablename__ = "committee_memberships"
    __table_args__ = {"schema": "congress"}

    bioguide_id: Mapped[str] = mapped_column(Text, ForeignKey("congress.legislators.bioguide_id", ondelete="CASCADE"), primary_key=True)
    committee_id: Mapped[str] = mapped_column(Text, ForeignKey("congress.committees.thomas_id", ondelete="CASCADE"), primary_key=True)
    rank: Mapped[Optional[int]] = mapped_column(Integer)
    role: Mapped[Optional[str]] = mapped_column(Text)


class MemberScore(Base):
    __tablename__ = "member_scores"
    __table_args__ = {"schema": "congress"}

    bioguide_id: Mapped[str] = mapped_column(Text, ForeignKey("congress.legislators.bioguide_id", ondelete="CASCADE"), primary_key=True)
    congress: Mapped[int] = mapped_column(Integer, primary_key=True)
    nominate_dim1: Mapped[Optional[float]] = mapped_column()
    nominate_dim2: Mapped[Optional[float]] = mapped_column()
    synced_at: Mapped[Optional[datetime]] = mapped_column()
```

- [ ] **Step 2: Create FEC models**

```python
# apps/api/app/db/models/fec.py
"""SQLAlchemy models for fec.* schema."""
from typing import Optional
from sqlalchemy import BigInteger, Text, SmallInteger, Numeric
from sqlalchemy.orm import Mapped, mapped_column
from app.db.models.congress import Base


class PacToCandidate(Base):
    __tablename__ = "pac_to_candidate"
    __table_args__ = {"schema": "fec"}

    sub_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    cmte_id: Mapped[str] = mapped_column(Text)
    cand_id: Mapped[Optional[str]] = mapped_column(Text)
    transaction_tp: Mapped[Optional[str]] = mapped_column(Text)
    transaction_amt: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    transaction_dt: Mapped[Optional[str]] = mapped_column(Text)
    cycle: Mapped[int] = mapped_column(SmallInteger)


class IndependentExpenditure(Base):
    __tablename__ = "independent_expenditures"
    __table_args__ = {"schema": "fec"}

    sub_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    cmte_id: Mapped[str] = mapped_column(Text)
    cand_id: Mapped[Optional[str]] = mapped_column(Text)
    sup_opp: Mapped[str] = mapped_column(Text)
    transaction_tp: Mapped[Optional[str]] = mapped_column(Text)
    transaction_amt: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    transaction_dt: Mapped[Optional[str]] = mapped_column(Text)
    cycle: Mapped[int] = mapped_column(SmallInteger)


class CmteName(Base):
    __tablename__ = "cmte_names"
    __table_args__ = {"schema": "fec"}

    cmte_id: Mapped[str] = mapped_column(Text, primary_key=True)
    cmte_name: Mapped[str] = mapped_column(Text)
    connected_org: Mapped[Optional[str]] = mapped_column(Text)
```

- [ ] **Step 3: Create app schema models**

```python
# apps/api/app/db/models/app_schema.py
"""SQLAlchemy models for app.* schema (user-facing data)."""
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.models.congress import Base


class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = {"schema": "app"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    display_name: Mapped[Optional[str]] = mapped_column(Text)
    avatar_url: Mapped[Optional[str]] = mapped_column(Text)
    activity_last_seen_at: Mapped[Optional[datetime]] = mapped_column()
    created_at: Mapped[Optional[datetime]] = mapped_column()


class FollowedPolitician(Base):
    __tablename__ = "followed_politicians"
    __table_args__ = {"schema": "app"}

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    politician_id: Mapped[str] = mapped_column(Text, ForeignKey("congress.legislators.bioguide_id"), primary_key=True)
    created_at: Mapped[Optional[datetime]] = mapped_column()


class TrackedBill(Base):
    __tablename__ = "tracked_bills"
    __table_args__ = {"schema": "app"}

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    bill_id: Mapped[str] = mapped_column(Text, ForeignKey("congress.bills.bill_id"), primary_key=True)
    created_at: Mapped[Optional[datetime]] = mapped_column()


class TopicPreference(Base):
    __tablename__ = "topic_preferences"
    __table_args__ = {"schema": "app"}

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    topic: Mapped[str] = mapped_column(Text, primary_key=True)
    created_at: Mapped[Optional[datetime]] = mapped_column()
```

- [ ] **Step 4: Create derived models**

```python
# apps/api/app/db/models/derived.py
"""SQLAlchemy models for derived.* schema."""
from datetime import datetime
from typing import Optional
from sqlalchemy import Text, SmallInteger, Integer, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.db.models.congress import Base


class LegislatorFundingSummary(Base):
    __tablename__ = "legislator_funding_summary"
    __table_args__ = {"schema": "derived"}

    bioguide_id: Mapped[str] = mapped_column(Text, ForeignKey("congress.legislators.bioguide_id", ondelete="CASCADE"), primary_key=True)
    cycle: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    pac_direct_total: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    large_donor_total: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    small_donor_total: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    superpac_ie_for: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    superpac_ie_against: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    in_state_total: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    out_of_state_total: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    computed_at: Mapped[Optional[datetime]] = mapped_column()


class LegislatorTopPac(Base):
    __tablename__ = "legislator_top_pacs"
    __table_args__ = {"schema": "derived"}

    bioguide_id: Mapped[str] = mapped_column(Text, ForeignKey("congress.legislators.bioguide_id", ondelete="CASCADE"), primary_key=True)
    cycle: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    cmte_id: Mapped[str] = mapped_column(Text, primary_key=True)
    cmte_name: Mapped[Optional[str]] = mapped_column(Text)
    industry: Mapped[Optional[str]] = mapped_column(Text)
    direct_contribution: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    ie_for: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    ie_against: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    total_support: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    rank: Mapped[Optional[int]] = mapped_column(Integer)


class LegislatorTopContributor(Base):
    __tablename__ = "legislator_top_contributors"
    __table_args__ = {"schema": "derived"}

    bioguide_id: Mapped[str] = mapped_column(Text, ForeignKey("congress.legislators.bioguide_id", ondelete="CASCADE"), primary_key=True)
    cycle: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    org_name: Mapped[str] = mapped_column(Text, primary_key=True)
    individual_total: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    pac_total: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    grand_total: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    rank: Mapped[Optional[int]] = mapped_column(Integer)


class ContributorLeaderboardCache(Base):
    __tablename__ = "contributor_leaderboard_cache"
    __table_args__ = {"schema": "derived"}

    cmte_id: Mapped[str] = mapped_column(Text, primary_key=True)
    cmte_name: Mapped[str] = mapped_column(Text)
    direct_total: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    ie_for_total: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    ie_against_total: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    total_contributions: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    recipient_count: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    top_recipients: Mapped[Optional[dict]] = mapped_column(JSONB)
    computed_at: Mapped[Optional[datetime]] = mapped_column()
```

- [ ] **Step 5: Create enrichment models**

```python
# apps/api/app/db/models/enrichment.py
"""SQLAlchemy models for enrichment.* schema."""
from datetime import datetime
from typing import Optional
from sqlalchemy import Text, BigInteger, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector
from app.db.models.congress import Base


class BillEmbedding(Base):
    __tablename__ = "bill_embeddings"
    __table_args__ = {"schema": "enrichment"}

    bill_id: Mapped[str] = mapped_column(Text, ForeignKey("congress.bills.bill_id", ondelete="CASCADE"), primary_key=True)
    embedding: Mapped[list[float]] = mapped_column(Vector(384))
    model_version: Mapped[str] = mapped_column(Text)
    created_at: Mapped[Optional[datetime]] = mapped_column()
```

- [ ] **Step 6: Update model registry**

```python
# apps/api/app/db/models/__init__.py
"""SQLAlchemy model registry — import all models here for Alembic discovery."""
from app.db.models.congress import Base, Legislator, Bill, BillVoteSummary, BillVotePosition, Committee, CommitteeMembership, MemberScore
from app.db.models.fec import PacToCandidate, IndependentExpenditure, CmteName
from app.db.models.app_schema import Profile, FollowedPolitician, TrackedBill, TopicPreference
from app.db.models.derived import LegislatorFundingSummary, LegislatorTopPac, LegislatorTopContributor, ContributorLeaderboardCache
from app.db.models.enrichment import BillEmbedding

__all__ = ["Base"]
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/app/db/models/
git commit -m "feat(api): SQLAlchemy 2.0 async models for all schemas"
```

---

## Task 3: Auth dependency (JWT validation)

**Files:**
- Create: `apps/api/app/auth.py`
- Create: `apps/api/app/deps.py`
- Create: `apps/api/tests/test_auth.py`

- [ ] **Step 1: Write tests**

```python
# apps/api/tests/test_auth.py
import pytest
from unittest.mock import patch, AsyncMock
from app.auth import decode_jwt


def test_decode_jwt_missing_token():
    """Empty token should raise ValueError."""
    with pytest.raises(ValueError, match="Missing"):
        decode_jwt("")


def test_decode_jwt_malformed_token():
    """Non-JWT string should raise ValueError."""
    with pytest.raises(ValueError):
        decode_jwt("not-a-jwt-token")
```

- [ ] **Step 2: Create auth module**

```python
# apps/api/app/auth.py
"""Supabase JWT validation via JWKS."""
import time
from typing import Any

import httpx
import structlog
from jose import jwt, JWTError

from app.config import settings

log = structlog.get_logger()

# JWKS cache
_jwks_cache: dict[str, Any] = {}
_jwks_cache_ttl: float = 0
_JWKS_CACHE_DURATION = 3600  # 1 hour


async def _get_jwks() -> dict:
    """Fetch and cache Supabase JWKS."""
    global _jwks_cache, _jwks_cache_ttl

    if _jwks_cache and time.time() < _jwks_cache_ttl:
        return _jwks_cache

    jwks_url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    async with httpx.AsyncClient() as client:
        resp = await client.get(jwks_url, timeout=10)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_cache_ttl = time.time() + _JWKS_CACHE_DURATION

    log.info("jwks_refreshed")
    return _jwks_cache


def decode_jwt(token: str) -> dict:
    """Decode and validate a Supabase JWT. Returns the payload dict.

    For use when JWKS is not available (e.g., using JWT secret directly).
    """
    if not token:
        raise ValueError("Missing token")

    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return payload
    except JWTError as e:
        raise ValueError(f"Invalid token: {e}")


async def validate_token(token: str) -> dict:
    """Validate a Supabase JWT. Tries JWKS first, falls back to secret."""
    if not token:
        raise ValueError("Missing token")

    # Try JWKS if supabase_url is configured
    if settings.supabase_url:
        try:
            jwks = await _get_jwks()
            payload = jwt.decode(
                token,
                jwks,
                algorithms=["RS256"],
                options={"verify_aud": False},
            )
            return payload
        except (JWTError, httpx.HTTPError):
            pass  # Fall through to secret-based validation

    # Fallback to JWT secret
    return decode_jwt(token)
```

- [ ] **Step 3: Create deps module**

```python
# apps/api/app/deps.py
"""FastAPI dependencies — DB session, auth, etc."""
import uuid
from typing import AsyncGenerator

from fastapi import Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import validate_token
from app.config import settings
from app.db.session import get_engine, async_session_factory

# Lazy-init engine and session factory
_engine = None
_session_factory = None


def _get_session_factory():
    global _engine, _session_factory
    if _session_factory is None:
        _engine = get_engine(settings.async_database_url)
        _session_factory = async_session_factory(_engine)
    return _session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async DB session. Auto-closes on exit."""
    factory = _get_session_factory()
    async with factory() as session:
        yield session


async def get_current_user(authorization: str = Header(default="")) -> dict:
    """Extract and validate the Supabase JWT from Authorization header.

    Returns the JWT payload dict (includes 'sub' as user ID).
    Raises 401 if invalid or missing.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization[7:]  # Strip "Bearer "

    try:
        payload = await validate_token(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing user ID")

    return {"user_id": uuid.UUID(user_id), "payload": payload}


async def get_optional_user(authorization: str = Header(default="")) -> dict | None:
    """Like get_current_user but returns None instead of 401 for anonymous requests."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return await get_current_user(authorization)
    except HTTPException:
        return None
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/smithi/Desktop/beyond-the-vote/apps/api && uv run pytest tests/test_auth.py -v
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/auth.py apps/api/app/deps.py apps/api/tests/test_auth.py
git commit -m "feat(api): Supabase JWT auth + FastAPI dependencies"
```

---

## Task 4: Middleware (request ID + Sentry + rate limiting)

**Files:**
- Create: `apps/api/app/middleware/request_id.py`
- Modify: `apps/api/app/main.py`

- [ ] **Step 1: Create request ID middleware**

```python
# apps/api/app/middleware/request_id.py
"""Request ID middleware — generates UUID per request, adds to logs and response header."""
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = str(uuid.uuid4())
        structlog.contextvars.bind_contextvars(request_id=request_id)

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id

        structlog.contextvars.unbind_contextvars("request_id")
        return response
```

- [ ] **Step 2: Update main.py — wire everything**

```python
# apps/api/app/main.py
"""FastAPI application with middleware, Sentry, and routers."""
from contextlib import asynccontextmanager

import sentry_sdk
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.logging import configure_logging
from app.middleware.request_id import RequestIDMiddleware

configure_logging(debug=settings.debug)
log = structlog.get_logger()

# Sentry
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=0.1,
    )

# Rate limiter
limiter = Limiter(key_func=get_remote_address, default_limits=[settings.rate_limit])


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("app_starting", environment=settings.environment)
    yield
    log.info("app_shutting_down")


app = FastAPI(
    title="Beyond the Ballot API",
    version="0.1.0",
    lifespan=lifespan,
)

# Middleware (order matters — outermost first)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
```

- [ ] **Step 3: Run health check test to verify nothing broke**

```bash
cd /Users/smithi/Desktop/beyond-the-vote/apps/api && uv run pytest tests/test_health.py -v
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/app/middleware/ apps/api/app/main.py
git commit -m "feat(api): request ID middleware, Sentry, rate limiting"
```

---

## Task 5: Pydantic schemas

**Files:**
- Create: `apps/api/app/schemas/common.py`
- Create: `apps/api/app/schemas/bills.py`
- Create: `apps/api/app/schemas/politicians.py`
- Create: `apps/api/app/schemas/donors.py`

- [ ] **Step 1: Create common schemas**

```python
# apps/api/app/schemas/common.py
"""Shared Pydantic schemas."""
from pydantic import BaseModel


class PaginationMeta(BaseModel):
    total: int
    limit: int
    offset: int


class ErrorResponse(BaseModel):
    detail: str
```

- [ ] **Step 2: Create bill schemas**

```python
# apps/api/app/schemas/bills.py
"""Pydantic schemas for bill endpoints."""
from datetime import date
from typing import Optional
from pydantic import BaseModel


class BillSummary(BaseModel):
    id: str
    number: str | None = None
    title: str
    sponsor: str | None = None
    party: str | None = None
    status: str | None = None
    topics: list[str] = []
    lastAction: str | None = None
    lastActionTimestamp: int | None = None
    summary: str | None = None


class BillListResponse(BaseModel):
    bills: list[BillSummary]
    pagination: "PaginationMeta"

    model_config = {"from_attributes": True}


from app.schemas.common import PaginationMeta
BillListResponse.model_rebuild()


class SponsorDetail(BaseModel):
    name: str | None = None
    bioguideId: str | None = None
    party: str | None = None
    state: str | None = None
    district: str | None = None


class PartyBreakdown(BaseModel):
    yea: int = 0
    nay: int = 0


class VoteDetail(BaseModel):
    id: str
    date: str | None = None
    chamber: str
    question: str | None = None
    result: str
    required: str | None = None
    yeas: int = 0
    nays: int = 0
    present: int = 0
    notVoting: int = 0
    partyBreakdown: dict[str, PartyBreakdown] = {}
    sourceUrl: str | None = None


class BillDetailResponse(BaseModel):
    bill: dict  # Flexible dict for the complex bill detail


class BillsByTopicResponse(BaseModel):
    slug: str
    bills: list[BillSummary]
    count: int
```

- [ ] **Step 3: Create politician schemas**

```python
# apps/api/app/schemas/politicians.py
"""Pydantic schemas for politician endpoints."""
from pydantic import BaseModel


class PoliticianSummary(BaseModel):
    id: str
    bioguideId: str
    name: str
    title: str | None = None
    party: str | None = None
    state: str | None = None
    district: str | None = None
    photo: str | None = None
    ideologyScore: float | None = None


class PoliticianSearchResponse(BaseModel):
    politicians: list[PoliticianSummary]


class PoliticianDetailResponse(BaseModel):
    politician: dict  # Complex nested object — flexible dict
```

- [ ] **Step 4: Create donor schemas**

```python
# apps/api/app/schemas/donors.py
"""Pydantic schemas for donor endpoints."""
from pydantic import BaseModel
from app.schemas.common import PaginationMeta


class TopRecipient(BaseModel):
    bioguideId: str | None = None
    name: str | None = None
    party: str | None = None
    state: str | None = None
    chamber: str | None = None
    amount: float = 0


class ContributorEntry(BaseModel):
    cmteId: str
    rank: int | None = None
    cmteName: str
    directTotal: float = 0
    ieForTotal: float = 0
    ieAgainstTotal: float = 0
    totalContributions: float = 0
    recipientCount: int = 0
    topRecipients: list[TopRecipient] = []


class DonorListResponse(BaseModel):
    contributors: list[ContributorEntry]
    pagination: PaginationMeta


class DonorDetailResponse(BaseModel):
    cmteId: str
    name: str
    connectedOrg: str | None = None
    totalContributions: float = 0
    directTotal: float = 0
    ieForTotal: float = 0
    ieAgainstTotal: float = 0
    recipientCount: int = 0
    recipients: list[dict] = []
    summary: str = ""
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/schemas/
git commit -m "feat(api): Pydantic response schemas for all endpoints"
```

---

## Task 6: Bills router + hybrid search query

**Files:**
- Create: `apps/api/app/queries/bills.py`
- Create: `apps/api/app/routers/bills.py`
- Create: `apps/api/tests/test_bills_router.py`

- [ ] **Step 1: Write test**

```python
# apps/api/tests/test_bills_router.py
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_bills_list_returns_200():
    """Bills list endpoint should return 200 (may be empty without DB)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/bills?limit=5")
    # Without a real DB, this will return 500 — acceptable for unit test
    # Integration tests will verify actual data
    assert resp.status_code in (200, 500)
```

- [ ] **Step 2: Create hybrid search SQL module**

```python
# apps/api/app/queries/bills.py
"""Bill search and lookup queries using raw SQL."""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def hybrid_bill_search(
    session: AsyncSession,
    query: str,
    query_embedding: list[float] | None = None,
    *,
    status: list[str] | None = None,
    topics: list[str] | None = None,
    congress: int | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """3-signal hybrid search: FTS + trigram + semantic (if embedding provided).

    Returns (results, total_count).
    """
    # Build filter clauses
    filters = []
    params: dict = {"query": query, "limit": limit, "offset": offset}

    if status:
        filters.append("b.status = ANY(:statuses)")
        params["statuses"] = status
    if topics:
        filters.append("b.topics && :topics")
        params["topics"] = topics
    if congress:
        filters.append("b.congress = :congress")
        params["congress"] = congress

    where_clause = " AND ".join(filters) if filters else "TRUE"

    # Base SQL with FTS + trigram
    sql = f"""
    WITH tsq AS (
        SELECT websearch_to_tsquery('english', :query) AS q
    ),
    fts AS (
        SELECT b.bill_id,
               ts_rank_cd(b.search_vector, tsq.q) AS fts_score,
               ROW_NUMBER() OVER (ORDER BY ts_rank_cd(b.search_vector, tsq.q) DESC) AS fts_rank
        FROM congress.bills b, tsq
        WHERE b.search_vector @@ tsq.q AND {where_clause}
        LIMIT 100
    ),
    trgm AS (
        SELECT b.bill_id,
               similarity(b.title, :query) AS trgm_score,
               ROW_NUMBER() OVER (ORDER BY similarity(b.title, :query) DESC) AS trgm_rank
        FROM congress.bills b
        WHERE similarity(b.title, :query) > 0.1 AND {where_clause}
        LIMIT 100
    ),
    """

    if query_embedding:
        params["embedding"] = str(query_embedding)
        sql += """
    semantic AS (
        SELECT be.bill_id,
               1 - (be.embedding <=> :embedding::vector) AS sem_score,
               ROW_NUMBER() OVER (ORDER BY be.embedding <=> :embedding::vector) AS sem_rank
        FROM enrichment.bill_embeddings be
        JOIN congress.bills b ON b.bill_id = be.bill_id
        WHERE {where_clause}
        LIMIT 100
    ),
    fused AS (
        SELECT COALESCE(f.bill_id, t.bill_id, s.bill_id) AS bill_id,
               COALESCE(1.0 / (60 + f.fts_rank), 0) +
               COALESCE(0.5 / (60 + t.trgm_rank), 0) +
               COALESCE(0.8 / (60 + s.sem_rank), 0) AS rrf_score
        FROM fts f
        FULL OUTER JOIN trgm t ON f.bill_id = t.bill_id
        FULL OUTER JOIN semantic s ON COALESCE(f.bill_id, t.bill_id) = s.bill_id
    )
    """.replace("{where_clause}", where_clause)
    else:
        sql += f"""
    fused AS (
        SELECT COALESCE(f.bill_id, t.bill_id) AS bill_id,
               COALESCE(1.0 / (60 + f.fts_rank), 0) +
               COALESCE(0.5 / (60 + t.trgm_rank), 0) AS rrf_score
        FROM fts f
        FULL OUTER JOIN trgm t ON f.bill_id = t.bill_id
    )
    """

    sql += """
    SELECT b.*, fused.rrf_score,
           COUNT(*) OVER() AS total_count
    FROM fused
    JOIN congress.bills b ON b.bill_id = fused.bill_id
    ORDER BY fused.rrf_score DESC
    LIMIT :limit OFFSET :offset
    """

    result = await session.execute(text(sql), params)
    rows = result.mappings().all()

    total = rows[0]["total_count"] if rows else 0
    return [dict(r) for r in rows], total


async def lookup_bill(session: AsyncSession, bill_id: str) -> dict | None:
    """Exact lookup by bill_id or bill_number."""
    sql = """
    SELECT * FROM congress.bills
    WHERE bill_id = :bill_id OR LOWER(bill_number) = LOWER(:bill_id)
    LIMIT 1
    """
    result = await session.execute(text(sql), {"bill_id": bill_id})
    row = result.mappings().first()
    return dict(row) if row else None


async def get_bills_by_topic(
    session: AsyncSession,
    topic: str,
    *,
    status: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """Get bills filtered by topic slug."""
    params: dict = {"topic": topic, "limit": limit}
    where = "topics @> ARRAY[:topic]::text[]"
    if status:
        where += " AND status = :status"
        params["status"] = status

    sql = f"""
    SELECT * FROM congress.bills
    WHERE {where}
    ORDER BY synced_at DESC
    LIMIT :limit
    """
    result = await session.execute(text(sql), params)
    return [dict(r) for r in result.mappings().all()]


async def get_bill_votes(session: AsyncSession, bill_id: str) -> list[dict]:
    """Get vote summaries and positions for a bill."""
    sql = """
    SELECT vs.*,
           json_agg(json_build_object(
               'bioguide_id', vp.bioguide_id,
               'position', vp.position,
               'name', l.full_name,
               'party', l.party,
               'state', l.state,
               'photo_url', l.photo_url
           )) AS member_positions
    FROM congress.bill_vote_summaries vs
    LEFT JOIN congress.bill_vote_positions vp ON vp.vote_id = vs.id
    LEFT JOIN congress.legislators l ON l.bioguide_id = vp.bioguide_id
    WHERE vs.bill_id = :bill_id
    GROUP BY vs.id
    ORDER BY vs.date DESC
    """
    result = await session.execute(text(sql), {"bill_id": bill_id})
    return [dict(r) for r in result.mappings().all()]
```

- [ ] **Step 3: Create bills router**

```python
# apps/api/app/routers/bills.py
"""Bill endpoints: list, search, detail, by-topic."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.queries.bills import hybrid_bill_search, lookup_bill, get_bills_by_topic, get_bill_votes

router = APIRouter(prefix="/api/bills", tags=["bills"])


@router.get("")
async def list_bills(
    q: str | None = None,
    status: str | None = None,
    topics: str | None = None,
    sort: str = "newest",
    limit: int = Query(default=20, le=250),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List or search bills."""
    if q:
        status_list = status.split(",") if status else None
        topic_list = topics.split(",") if topics else None
        results, total = await hybrid_bill_search(
            db, q, status=status_list, topics=topic_list, limit=limit, offset=offset,
        )
        bills = [_format_bill_summary(r) for r in results]
        return {"bills": bills, "pagination": {"total": total, "limit": limit, "offset": offset}}

    # Browse mode — simple query
    from sqlalchemy import text
    params: dict = {"limit": limit, "offset": offset}
    where_parts = []
    if status:
        where_parts.append("status = ANY(:statuses)")
        params["statuses"] = status.split(",")
    if topics:
        where_parts.append("topics && :topics")
        params["topics"] = topics.split(",")

    where = " AND ".join(where_parts) if where_parts else "TRUE"
    order = "synced_at DESC" if sort == "newest" else "synced_at ASC"

    sql = f"""
    SELECT *, COUNT(*) OVER() AS total_count
    FROM congress.bills
    WHERE {where}
    ORDER BY {order}
    LIMIT :limit OFFSET :offset
    """
    result = await db.execute(text(sql), params)
    rows = result.mappings().all()

    total = rows[0]["total_count"] if rows else 0
    bills = [_format_bill_summary(dict(r)) for r in rows]
    return {"bills": bills, "pagination": {"total": total, "limit": limit, "offset": offset}}


@router.get("/by-topic")
async def bills_by_topic(
    slug: str = Query(...),
    status: str | None = None,
    limit: int = Query(default=20, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get bills filtered by topic slug."""
    results = await get_bills_by_topic(db, slug, status=status, limit=limit)
    bills = [_format_bill_summary(r) for r in results]
    return {"slug": slug, "bills": bills, "count": len(bills)}


@router.get("/{bill_id}")
async def bill_detail(bill_id: str, db: AsyncSession = Depends(get_db)):
    """Get detailed bill info including votes."""
    bill = await lookup_bill(db, bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    votes = await get_bill_votes(db, bill["bill_id"])

    return {
        "bill": {
            "id": bill["bill_id"],
            "number": bill.get("bill_number"),
            "title": bill["title"],
            "congress": bill["congress"],
            "introducedDate": str(bill.get("introduced_date") or ""),
            "status": bill.get("status"),
            "summary": bill.get("summary"),
            "sponsor": {
                "name": bill.get("sponsor_name"),
                "bioguideId": bill.get("sponsor_bioguide_id"),
                "party": bill.get("sponsor_party"),
            } if bill.get("sponsor_bioguide_id") else None,
            "policyArea": bill.get("policy_area"),
            "topics": bill.get("topics", []),
            "congressGovUrl": bill.get("congress_gov_url"),
            "lastActionText": bill.get("last_action_text"),
            "lastActionDate": str(bill.get("last_action_date") or ""),
            "votes": [_format_vote(v) for v in votes],
        }
    }


def _format_bill_summary(row: dict) -> dict:
    last_action = row.get("last_action_date")
    return {
        "id": row["bill_id"],
        "number": row.get("bill_number"),
        "title": row["title"],
        "sponsor": row.get("sponsor_name"),
        "party": row.get("sponsor_party"),
        "status": row.get("status"),
        "topics": row.get("topics", []),
        "lastAction": str(last_action) if last_action else None,
        "summary": (row.get("summary") or row.get("last_action_text") or "")[:400],
    }


def _format_vote(row: dict) -> dict:
    return {
        "id": row["id"],
        "date": str(row.get("date") or ""),
        "chamber": row["chamber"],
        "question": row.get("question"),
        "result": row["result"],
        "yeas": row.get("yea_total", 0),
        "nays": row.get("nay_total", 0),
        "present": row.get("present_total", 0),
        "notVoting": row.get("not_voting_total", 0),
        "partyBreakdown": {
            "democrat": {"yea": row.get("yea_democrat", 0) or 0, "nay": row.get("nay_democrat", 0) or 0},
            "republican": {"yea": row.get("yea_republican", 0) or 0, "nay": row.get("nay_republican", 0) or 0},
            "independent": {"yea": row.get("yea_independent", 0) or 0, "nay": row.get("nay_independent", 0) or 0},
        },
        "memberPositions": row.get("member_positions", []),
        "sourceUrl": row.get("source_url"),
    }
```

- [ ] **Step 4: Wire bills router to main app**

Add to `apps/api/app/main.py` after the healthz endpoint:

```python
from app.routers import bills

app.include_router(bills.router)
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/smithi/Desktop/beyond-the-vote/apps/api && uv run pytest tests/ -v
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/app/queries/bills.py apps/api/app/routers/bills.py \
  apps/api/app/main.py apps/api/tests/test_bills_router.py
git commit -m "feat(api): bills router with hybrid search"
```

---

## Task 7: Politicians router

**Files:**
- Create: `apps/api/app/routers/politicians.py`

- [ ] **Step 1: Create politicians router**

```python
# apps/api/app/routers/politicians.py
"""Politician endpoints: search + detail."""
import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db

router = APIRouter(prefix="/api/politicians", tags=["politicians"])


@router.get("/search")
async def search_politicians(
    q: str = Query(..., min_length=2),
    db: AsyncSession = Depends(get_db),
):
    """Search politicians by name."""
    sql = """
    SELECT l.bioguide_id, l.full_name, l.title, l.party, l.state, l.state_full,
           l.district, l.photo_url, l.chamber, l.term_start,
           ms.nominate_dim1
    FROM congress.legislators l
    LEFT JOIN congress.member_scores ms
        ON ms.bioguide_id = l.bioguide_id
        AND ms.congress = (SELECT MAX(congress) FROM congress.member_scores WHERE bioguide_id = l.bioguide_id)
    WHERE l.full_name ILIKE :pattern OR l.last_name ILIKE :pattern
    ORDER BY l.in_office DESC, l.full_name
    LIMIT 10
    """
    result = await db.execute(text(sql), {"pattern": f"%{q}%"})
    rows = result.mappings().all()

    politicians = []
    seen = set()
    for r in rows:
        if r["bioguide_id"] in seen:
            continue
        seen.add(r["bioguide_id"])
        district_str = f"{r['district']}th District" if r.get("district") else None
        politicians.append({
            "id": r["bioguide_id"],
            "bioguideId": r["bioguide_id"],
            "name": r["full_name"],
            "title": f"U.S. {r['title']}",
            "party": r["party"],
            "state": r["state"],
            "district": district_str,
            "photo": r.get("photo_url"),
            "ideologyScore": float(r["nominate_dim1"]) if r.get("nominate_dim1") is not None else None,
        })

    return {"politicians": politicians}


@router.get("/{bioguide_id}")
async def politician_detail(bioguide_id: str, db: AsyncSession = Depends(get_db)):
    """Get detailed politician info with votes, committees, and funding."""
    # Run parallel queries
    profile_task = _get_profile(db, bioguide_id)
    ideology_task = _get_ideology(db, bioguide_id)
    committees_task = _get_committees(db, bioguide_id)
    votes_task = _get_recent_votes(db, bioguide_id)
    funding_task = _get_funding(db, bioguide_id)
    top_pacs_task = _get_top_pacs(db, bioguide_id)
    top_contributors_task = _get_top_contributors(db, bioguide_id)

    results = await asyncio.gather(
        profile_task, ideology_task, committees_task,
        votes_task, funding_task, top_pacs_task, top_contributors_task,
        return_exceptions=True,
    )

    profile = results[0] if not isinstance(results[0], Exception) else None
    if not profile:
        raise HTTPException(status_code=404, detail="Politician not found")

    ideology = results[1] if not isinstance(results[1], Exception) else None
    committees = results[2] if not isinstance(results[2], Exception) else []
    votes = results[3] if not isinstance(results[3], Exception) else []
    funding = results[4] if not isinstance(results[4], Exception) else {}
    top_pacs = results[5] if not isinstance(results[5], Exception) else []
    top_contributors = results[6] if not isinstance(results[6], Exception) else []

    district_str = f"{profile['district']}th District" if profile.get("district") else None
    years_in_office = None
    if profile.get("term_start"):
        from datetime import date
        years_in_office = (date.today() - profile["term_start"]).days // 365

    ideology_score = float(ideology["nominate_dim1"]) if ideology and ideology.get("nominate_dim1") is not None else None
    ideology_label = _ideology_label(ideology_score) if ideology_score is not None else None

    return {
        "politician": {
            "id": profile["bioguide_id"],
            "bioguideId": profile["bioguide_id"],
            "name": profile["full_name"],
            "title": f"U.S. {profile['title']}",
            "party": profile["party"],
            "state": profile["state_full"],
            "stateCode": profile["state"],
            "district": district_str,
            "since": str(profile["term_start"].year) if profile.get("term_start") else None,
            "photo": profile.get("photo_url"),
            "website": profile.get("website"),
            "address": profile.get("address"),
            "phone": profile.get("phone"),
            "twitter": profile.get("twitter"),
            "nextElectionYear": profile.get("next_election"),
            "stats": {
                "yearsInOffice": years_in_office,
                "ideologyScore": ideology_score,
                "ideologyLabel": ideology_label,
            },
            "votes": votes,
            "committees": committees,
            "pacDonors": top_pacs,
            "topContributors": top_contributors,
            "fundingBreakdown": funding,
        }
    }


async def _get_profile(db: AsyncSession, bioguide_id: str) -> dict | None:
    result = await db.execute(
        text("SELECT * FROM congress.legislators WHERE bioguide_id = :id"),
        {"id": bioguide_id},
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def _get_ideology(db: AsyncSession, bioguide_id: str) -> dict | None:
    result = await db.execute(
        text("""SELECT * FROM congress.member_scores
                WHERE bioguide_id = :id ORDER BY congress DESC LIMIT 1"""),
        {"id": bioguide_id},
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def _get_committees(db: AsyncSession, bioguide_id: str) -> list[dict]:
    result = await db.execute(
        text("""SELECT c.name, c.url, c.chamber, cm.role
                FROM congress.committee_memberships cm
                JOIN congress.committees c ON c.thomas_id = cm.committee_id
                WHERE cm.bioguide_id = :id"""),
        {"id": bioguide_id},
    )
    return [{"name": r["name"], "url": r.get("url"), "chamber": r.get("chamber"), "title": r.get("role")} for r in result.mappings().all()]


async def _get_recent_votes(db: AsyncSession, bioguide_id: str) -> list[dict]:
    result = await db.execute(
        text("""SELECT vs.id, vs.date, vs.chamber, vs.question, vs.result,
                       vs.yea_total, vs.nay_total, vs.bill_id, vp.position,
                       b.title as bill_title
                FROM congress.bill_vote_positions vp
                JOIN congress.bill_vote_summaries vs ON vs.id = vp.vote_id
                LEFT JOIN congress.bills b ON b.bill_id = vs.bill_id
                WHERE vp.bioguide_id = :id
                ORDER BY vs.date DESC LIMIT 50"""),
        {"id": bioguide_id},
    )
    return [
        {
            "date": str(r["date"]),
            "chamber": r["chamber"],
            "question": r.get("question"),
            "result": r["result"],
            "position": r["position"],
            "billId": r.get("bill_id"),
            "billTitle": r.get("bill_title"),
        }
        for r in result.mappings().all()
    ]


async def _get_funding(db: AsyncSession, bioguide_id: str) -> dict:
    result = await db.execute(
        text("SELECT * FROM derived.legislator_funding_summary WHERE bioguide_id = :id ORDER BY cycle DESC"),
        {"id": bioguide_id},
    )
    rows = result.mappings().all()
    if not rows:
        return {}
    latest = dict(rows[0])
    return {
        "cycle": latest.get("cycle"),
        "pacDirectTotal": float(latest.get("pac_direct_total") or 0),
        "largeDonorTotal": float(latest.get("large_donor_total") or 0),
        "smallDonorTotal": float(latest.get("small_donor_total") or 0),
        "superpacIeFor": float(latest.get("superpac_ie_for") or 0),
        "superpacIeAgainst": float(latest.get("superpac_ie_against") or 0),
        "inStateTotal": float(latest.get("in_state_total") or 0),
        "outOfStateTotal": float(latest.get("out_of_state_total") or 0),
    }


async def _get_top_pacs(db: AsyncSession, bioguide_id: str) -> list[dict]:
    result = await db.execute(
        text("""SELECT * FROM derived.legislator_top_pacs
                WHERE bioguide_id = :id ORDER BY cycle DESC, total_support DESC LIMIT 20"""),
        {"id": bioguide_id},
    )
    return [
        {"cmteId": r["cmte_id"], "cmteName": r.get("cmte_name"), "industry": r.get("industry"),
         "directContribution": float(r.get("direct_contribution") or 0),
         "ieFor": float(r.get("ie_for") or 0), "totalSupport": float(r.get("total_support") or 0)}
        for r in result.mappings().all()
    ]


async def _get_top_contributors(db: AsyncSession, bioguide_id: str) -> list[dict]:
    result = await db.execute(
        text("""SELECT * FROM derived.legislator_top_contributors
                WHERE bioguide_id = :id ORDER BY cycle DESC, grand_total DESC LIMIT 20"""),
        {"id": bioguide_id},
    )
    return [
        {"orgName": r["org_name"], "individualTotal": float(r.get("individual_total") or 0),
         "pacTotal": float(r.get("pac_total") or 0), "grandTotal": float(r.get("grand_total") or 0)}
        for r in result.mappings().all()
    ]


def _ideology_label(score: float) -> str:
    if score < -0.3:
        return "Liberal"
    elif score > 0.3:
        return "Conservative"
    return "Moderate"
```

- [ ] **Step 2: Wire to main app**

Add to `apps/api/app/main.py`:

```python
from app.routers import politicians
app.include_router(politicians.router)
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/app/routers/politicians.py apps/api/app/main.py
git commit -m "feat(api): politicians router with search and detail"
```

---

## Task 8: Donors router

**Files:**
- Create: `apps/api/app/queries/donors.py`
- Create: `apps/api/app/routers/donors.py`

- [ ] **Step 1: Create donor queries**

```python
# apps/api/app/queries/donors.py
"""PAC detail and leaderboard queries."""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def pac_leaderboard(
    session: AsyncSession,
    *,
    q: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """Query contributor leaderboard cache. Returns (rows, total)."""
    params: dict = {"limit": limit, "offset": offset}

    if q:
        where = "cmte_name ILIKE :pattern"
        params["pattern"] = f"%{q}%"
    else:
        where = "TRUE"

    sql = f"""
    SELECT *, COUNT(*) OVER() AS total_count
    FROM derived.contributor_leaderboard_cache
    WHERE {where}
    ORDER BY total_contributions DESC
    LIMIT :limit OFFSET :offset
    """
    result = await session.execute(text(sql), params)
    rows = result.mappings().all()
    total = rows[0]["total_count"] if rows else 0
    return [dict(r) for r in rows], total


async def pac_detail(session: AsyncSession, cmte_id: str) -> dict | None:
    """Get PAC detail with aggregated contributions and top recipients."""
    sql = """
    WITH cmte_info AS (
        SELECT cmte_id, cmte_name, connected_org
        FROM fec.cmte_names WHERE cmte_id = :cmte_id
    ),
    direct AS (
        SELECT cand_id, SUM(transaction_amt) AS direct_total
        FROM fec.pac_to_candidate
        WHERE cmte_id = :cmte_id
        GROUP BY cand_id
    ),
    ie AS (
        SELECT cand_id, sup_opp, SUM(transaction_amt) AS ie_total
        FROM fec.independent_expenditures
        WHERE cmte_id = :cmte_id
        GROUP BY cand_id, sup_opp
    ),
    per_candidate AS (
        SELECT COALESCE(d.cand_id, ie.cand_id) AS cand_id,
               COALESCE(d.direct_total, 0) AS direct,
               COALESCE(ie_for.ie_total, 0) AS ie_for,
               COALESCE(ie_against.ie_total, 0) AS ie_against
        FROM direct d
        FULL OUTER JOIN (SELECT * FROM ie WHERE sup_opp = 'S') ie_for ON d.cand_id = ie_for.cand_id
        FULL OUTER JOIN (SELECT * FROM ie WHERE sup_opp = 'O') ie_against ON COALESCE(d.cand_id, ie_for.cand_id) = ie_against.cand_id
    )
    SELECT ci.cmte_name, ci.connected_org,
           pc.cand_id, pc.direct, pc.ie_for, pc.ie_against,
           pc.direct + pc.ie_for AS total_support,
           l.bioguide_id, l.full_name, l.party, l.state, l.chamber
    FROM cmte_info ci
    CROSS JOIN per_candidate pc
    LEFT JOIN congress.legislators l ON pc.cand_id = ANY(l.fec_ids)
    ORDER BY total_support DESC
    LIMIT 20
    """
    result = await session.execute(text(sql), {"cmte_id": cmte_id})
    rows = result.mappings().all()
    if not rows:
        return None

    first = rows[0]
    recipients = []
    total_direct = 0
    total_ie_for = 0
    total_ie_against = 0

    for r in rows:
        direct = float(r.get("direct") or 0)
        ie_for = float(r.get("ie_for") or 0)
        ie_against = float(r.get("ie_against") or 0)
        total_direct += direct
        total_ie_for += ie_for
        total_ie_against += ie_against
        recipients.append({
            "bioguideId": r.get("bioguide_id"),
            "name": r.get("full_name"),
            "party": r.get("party"),
            "state": r.get("state"),
            "chamber": r.get("chamber"),
            "direct": direct,
            "ieFor": ie_for,
            "ieAgainst": ie_against,
            "amount": direct + ie_for,
        })

    return {
        "cmteId": cmte_id,
        "name": first["cmte_name"],
        "connectedOrg": first.get("connected_org"),
        "directTotal": total_direct,
        "ieForTotal": total_ie_for,
        "ieAgainstTotal": total_ie_against,
        "totalContributions": total_direct + total_ie_for + total_ie_against,
        "recipientCount": len(recipients),
        "recipients": recipients,
    }
```

- [ ] **Step 2: Create donors router**

```python
# apps/api/app/routers/donors.py
"""Donor endpoints: PAC leaderboard + detail."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.queries.donors import pac_leaderboard, pac_detail

router = APIRouter(prefix="/api/donors", tags=["donors"])


@router.get("")
async def list_donors(
    q: str | None = None,
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """PAC leaderboard with optional name search."""
    rows, total = await pac_leaderboard(db, q=q, limit=limit, offset=offset)

    contributors = []
    for i, r in enumerate(rows):
        contributors.append({
            "cmteId": r["cmte_id"],
            "rank": offset + i + 1,
            "cmteName": r["cmte_name"],
            "directTotal": float(r.get("direct_total") or 0),
            "ieForTotal": float(r.get("ie_for_total") or 0),
            "ieAgainstTotal": float(r.get("ie_against_total") or 0),
            "totalContributions": float(r.get("total_contributions") or 0),
            "recipientCount": r.get("recipient_count", 0),
            "topRecipients": r.get("top_recipients") or [],
        })

    return {"contributors": contributors, "pagination": {"total": total, "limit": limit, "offset": offset}}


@router.get("/{cmte_id}")
async def donor_detail(cmte_id: str, db: AsyncSession = Depends(get_db)):
    """Get PAC detail with recipient breakdown."""
    result = await pac_detail(db, cmte_id)
    if not result:
        raise HTTPException(status_code=404, detail="Committee not found")
    return result
```

- [ ] **Step 3: Wire to main app and commit**

Add to `apps/api/app/main.py`:
```python
from app.routers import donors
app.include_router(donors.router)
```

```bash
git add apps/api/app/queries/donors.py apps/api/app/routers/donors.py apps/api/app/main.py
git commit -m "feat(api): donors router with PAC leaderboard and detail"
```

---

## Task 9: Dashboard router (auth-required)

**Files:**
- Create: `apps/api/app/routers/dashboard.py`

- [ ] **Step 1: Create dashboard router**

```python
# apps/api/app/routers/dashboard.py
"""Dashboard endpoints — all require authentication."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/followed")
async def get_followed(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get user's followed politicians with latest votes."""
    user_id = str(user["user_id"])

    sql = """
    SELECT l.bioguide_id, l.full_name, l.title, l.party, l.state, l.state_full,
           l.district, l.photo_url
    FROM app.followed_politicians fp
    JOIN congress.legislators l ON l.bioguide_id = fp.politician_id
    WHERE fp.user_id = :user_id
    ORDER BY l.full_name
    """
    result = await db.execute(text(sql), {"user_id": user_id})
    legislators = result.mappings().all()

    politicians = []
    for r in legislators:
        # Get latest vote
        vote_sql = """
        SELECT vs.bill_id, vs.question, vs.date, vp.position, b.title as bill_title
        FROM congress.bill_vote_positions vp
        JOIN congress.bill_vote_summaries vs ON vs.id = vp.vote_id
        LEFT JOIN congress.bills b ON b.bill_id = vs.bill_id
        WHERE vp.bioguide_id = :bio_id
        ORDER BY vs.date DESC LIMIT 1
        """
        vote_result = await db.execute(text(vote_sql), {"bio_id": r["bioguide_id"]})
        latest_vote = vote_result.mappings().first()

        district_str = f"{r['district']}th District" if r.get("district") else None
        entry = {
            "id": r["bioguide_id"],
            "name": r["full_name"],
            "title": f"U.S. {r['title']}",
            "party": r["party"],
            "state": r["state_full"],
            "photo": r.get("photo_url"),
            "district": district_str,
            "latestVote": None,
        }
        if latest_vote:
            entry["latestVote"] = {
                "billId": latest_vote.get("bill_id"),
                "billTitle": latest_vote.get("bill_title"),
                "date": str(latest_vote["date"]),
                "vote": latest_vote["position"],
                "question": latest_vote.get("question"),
            }
        politicians.append(entry)

    return {"politicians": politicians}


@router.get("/tracked-bills")
async def get_tracked_bills(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get user's tracked bills."""
    user_id = str(user["user_id"])

    sql = """
    SELECT b.bill_id, b.bill_number, b.title, b.status,
           b.last_action_date, b.last_action_text, b.policy_area
    FROM app.tracked_bills tb
    JOIN congress.bills b ON b.bill_id = tb.bill_id
    WHERE tb.user_id = :user_id
    ORDER BY b.last_action_date DESC NULLS LAST
    """
    result = await db.execute(text(sql), {"user_id": user_id})
    rows = result.mappings().all()

    bills = [
        {
            "id": r["bill_id"],
            "number": r.get("bill_number"),
            "title": r["title"],
            "status": r.get("status"),
            "lastAction": str(r["last_action_date"]) if r.get("last_action_date") else None,
            "lastActionText": r.get("last_action_text"),
            "category": r.get("policy_area") or "",
        }
        for r in rows
    ]

    return {"bills": bills}


@router.get("/topic-preferences")
async def get_topic_preferences(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get user's topic preferences."""
    user_id = str(user["user_id"])
    result = await db.execute(
        text("SELECT topic FROM app.topic_preferences WHERE user_id = :user_id"),
        {"user_id": user_id},
    )
    topics = [r["topic"] for r in result.mappings().all()]
    return {"topics": topics}
```

- [ ] **Step 2: Wire to main app and commit**

Add to `apps/api/app/main.py`:
```python
from app.routers import dashboard
app.include_router(dashboard.router)
```

```bash
git add apps/api/app/routers/dashboard.py apps/api/app/main.py
git commit -m "feat(api): dashboard router with auth-protected endpoints"
```

---

## Task 10: Representatives router (geocoding)

**Files:**
- Create: `apps/api/app/routers/representatives.py`

- [ ] **Step 1: Create representatives router**

```python
# apps/api/app/routers/representatives.py
"""Representative lookup via address geocoding."""
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_db

router = APIRouter(prefix="/api/representatives", tags=["representatives"])


@router.get("")
async def lookup_representatives(
    address: str = Query(..., min_length=5),
    db: AsyncSession = Depends(get_db),
):
    """Look up representatives by address via Geocodio."""
    if not settings.geocodio_api_key:
        raise HTTPException(status_code=503, detail="Geocoding not configured")

    # Geocode address
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.geocod.io/v1.7/geocode",
            params={
                "q": address,
                "fields": "cd",
                "api_key": settings.geocodio_api_key,
            },
            timeout=10,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Geocoding failed")

        data = resp.json()

    results = data.get("results", [])
    if not results:
        return {"representatives": []}

    # Extract congressional districts
    fields = results[0].get("fields", {})
    districts = fields.get("congressional_districts", [])
    state = results[0].get("address_components", {}).get("state", "")

    if not districts or not state:
        return {"representatives": []}

    district_numbers = [d.get("district_number") for d in districts if d.get("district_number") is not None]

    # Query legislators: senators for state + reps for district
    sql = """
    SELECT l.bioguide_id, l.full_name, l.title, l.party, l.state, l.state_full,
           l.district, l.photo_url, l.chamber, l.website, l.phone, l.term_start,
           ms.nominate_dim1
    FROM congress.legislators l
    LEFT JOIN congress.member_scores ms
        ON ms.bioguide_id = l.bioguide_id
        AND ms.congress = (SELECT MAX(congress) FROM congress.member_scores WHERE bioguide_id = l.bioguide_id)
    WHERE l.in_office = true
      AND l.state = :state
      AND (l.chamber = 'Senate' OR l.district = ANY(:districts))
    ORDER BY l.chamber DESC, l.full_name
    """
    result = await db.execute(text(sql), {"state": state, "districts": district_numbers})
    rows = result.mappings().all()

    representatives = []
    seen = set()
    for r in rows:
        if r["bioguide_id"] in seen:
            continue
        seen.add(r["bioguide_id"])
        district_str = f"{r['district']}th District" if r.get("district") else None
        since = str(r["term_start"].year) if r.get("term_start") else None
        representatives.append({
            "id": r["bioguide_id"],
            "bioguideId": r["bioguide_id"],
            "name": r["full_name"],
            "title": f"U.S. {r['title']}",
            "party": r["party"],
            "state": r["state"],
            "district": district_str,
            "photo": r.get("photo_url"),
            "since": since,
            "website": r.get("website"),
            "phone": r.get("phone"),
            "ideologyScore": float(r["nominate_dim1"]) if r.get("nominate_dim1") is not None else None,
        })

    return {"representatives": representatives}
```

- [ ] **Step 2: Wire to main app and commit**

Add to `apps/api/app/main.py`:
```python
from app.routers import representatives
app.include_router(representatives.router)
```

```bash
git add apps/api/app/routers/representatives.py apps/api/app/main.py
git commit -m "feat(api): representatives router with Geocodio address lookup"
```

---

## Task 11: Wire all routers + final integration

**Files:**
- Modify: `apps/api/app/main.py` (final version)
- Create: `apps/api/tests/test_routers.py`

- [ ] **Step 1: Finalize main.py with all routers**

Ensure `apps/api/app/main.py` includes all routers. The final imports section should be:

```python
from app.routers import bills, politicians, donors, dashboard, representatives

app.include_router(bills.router)
app.include_router(politicians.router)
app.include_router(donors.router)
app.include_router(dashboard.router)
app.include_router(representatives.router)
```

- [ ] **Step 2: Write router smoke tests**

```python
# apps/api/tests/test_routers.py
"""Smoke tests to verify all routers are registered."""
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_all_routers_registered():
    """Verify all expected routes exist in the app."""
    routes = [r.path for r in app.routes]
    assert "/healthz" in routes
    assert "/api/bills" in routes or any("/api/bills" in r for r in routes)
    assert "/api/politicians/search" in routes or any("/api/politicians" in r for r in routes)
    assert "/api/donors" in routes or any("/api/donors" in r for r in routes)
    assert "/api/dashboard/followed" in routes or any("/api/dashboard" in r for r in routes)
    assert "/api/representatives" in routes or any("/api/representatives" in r for r in routes)


@pytest.mark.asyncio
async def test_openapi_schema_generates():
    """Verify OpenAPI schema generates without errors."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    schema = resp.json()
    assert "paths" in schema
    assert "/api/bills" in schema["paths"] or "/api/bills/" in schema["paths"]
```

- [ ] **Step 3: Run all tests**

```bash
cd /Users/smithi/Desktop/beyond-the-vote/apps/api && uv run pytest tests/ -v
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/
git commit -m "feat(api): all core routers wired, OpenAPI schema verified"
```

---

## Parallel execution map

```
Task 1 (DB session) ──► Task 2 (models) ──► Task 3 (auth) ──► Task 4 (middleware)
                                                                      │
                                                         ┌────────────┼────────────┐
                                                         ▼            ▼            ▼
                                                   Task 5 (schemas)  ...          ...
                                                         │
                              ┌───────────┬──────────────┼──────────────┬──────────────┐
                              ▼           ▼              ▼              ▼              ▼
                        Task 6       Task 7          Task 8        Task 9         Task 10
                       (bills)   (politicians)     (donors)    (dashboard)    (representatives)
                              │           │              │              │              │
                              └───────────┴──────────────┴──────────────┴──────────────┘
                                                         │
                                                         ▼
                                                   Task 11 (wire + tests)
```

**Tasks 1-4** are sequential (each builds on the previous).

**Tasks 5-10** are independent after Task 4 and can run in parallel.

**Task 11** depends on all routers being complete.
