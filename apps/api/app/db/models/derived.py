"""SQLAlchemy 2.0 mapped models for derived/aggregated data tables."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, SmallInteger, Text, text
from sqlalchemy.dialects.postgresql import REAL
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models.congress import Base


class LegislatorFundingSummary(Base):
    __tablename__ = "legislator_funding_summary"
    __table_args__ = {"schema": "derived"}

    bioguide_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("congress.legislators.bioguide_id", ondelete="CASCADE"),
        primary_key=True,
    )
    cycle: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    pac_direct_total: Mapped[Optional[float]] = mapped_column(
        Numeric(12, 2), nullable=True, server_default="0"
    )
    large_donor_total: Mapped[Optional[float]] = mapped_column(
        Numeric(12, 2), nullable=True, server_default="0"
    )
    small_donor_total: Mapped[Optional[float]] = mapped_column(
        Numeric(12, 2), nullable=True, server_default="0"
    )
    superpac_ie_for: Mapped[Optional[float]] = mapped_column(
        Numeric(12, 2), nullable=True, server_default="0"
    )
    superpac_ie_against: Mapped[Optional[float]] = mapped_column(
        Numeric(12, 2), nullable=True, server_default="0"
    )
    in_state_total: Mapped[Optional[float]] = mapped_column(
        Numeric(12, 2), nullable=True, server_default="0"
    )
    out_of_state_total: Mapped[Optional[float]] = mapped_column(
        Numeric(12, 2), nullable=True, server_default="0"
    )
    computed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class PacTopFunders(Base):
    __tablename__ = "pac_top_funders"
    __table_args__ = {"schema": "derived"}

    cmte_id: Mapped[str] = mapped_column(Text, primary_key=True)
    cycle: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    canonical_donor_id: Mapped[str] = mapped_column(Text, primary_key=True)
    display_name: Mapped[str] = mapped_column(Text)
    employer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    state: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2))
    contribution_count: Mapped[int] = mapped_column(Integer)
    confidence: Mapped[float] = mapped_column(REAL)
    rank: Mapped[int] = mapped_column(Integer)
    computed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class PacAiSummaries(Base):
    __tablename__ = "pac_ai_summaries"
    __table_args__ = {"schema": "derived"}

    cmte_id: Mapped[str] = mapped_column(Text, primary_key=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )


class PacDetailCache(Base):
    __tablename__ = "pac_detail_cache"
    __table_args__ = {"schema": "derived"}
    cmte_id: Mapped[str] = mapped_column(Text, primary_key=True)
    cand_id: Mapped[str] = mapped_column(Text, primary_key=True)
    cycle: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    cmte_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    connected_org: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    bioguide_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    full_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    party: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    state: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    chamber: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    direct: Mapped[float] = mapped_column(Numeric(12, 2), server_default="0")
    ie_for: Mapped[float] = mapped_column(Numeric(12, 2), server_default="0")
    ie_against: Mapped[float] = mapped_column(Numeric(12, 2), server_default="0")
    total_support: Mapped[float] = mapped_column(Numeric(12, 2), server_default="0")


class PacLeaderboard(Base):
    __tablename__ = "pac_leaderboard"
    __table_args__ = {"schema": "derived"}
    cmte_id: Mapped[str] = mapped_column(Text, primary_key=True)
    cmte_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    direct_total: Mapped[float] = mapped_column(Numeric(14, 2), server_default="0")
    ie_for_total: Mapped[float] = mapped_column(Numeric(14, 2), server_default="0")
    ie_against_total: Mapped[float] = mapped_column(Numeric(14, 2), server_default="0")
    total_contributions: Mapped[float] = mapped_column(Numeric(14, 2), server_default="0")
    global_rank: Mapped[int] = mapped_column(Integer)
    cycle: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    computed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class LegislatorTopContributors(Base):
    __tablename__ = "legislator_top_contributors"
    __table_args__ = {"schema": "derived"}
    bioguide_id: Mapped[str] = mapped_column(Text, primary_key=True)
    cmte_id: Mapped[str] = mapped_column(Text, primary_key=True)
    org_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    direct: Mapped[float] = mapped_column(Numeric(12, 2), server_default="0")
    ie_for: Mapped[float] = mapped_column(Numeric(12, 2), server_default="0")
    total: Mapped[float] = mapped_column(Numeric(12, 2), server_default="0")
    rank: Mapped[int] = mapped_column(Integer)
    cycle: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    computed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
