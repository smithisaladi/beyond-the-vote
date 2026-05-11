"""SQLAlchemy 2.0 mapped models for the congress schema."""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import ARRAY, Boolean, Date, DateTime, ForeignKey, Integer, SmallInteger, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Legislator(Base):
    __tablename__ = "legislators"
    __table_args__ = {"schema": "congress"}

    bioguide_id: Mapped[str] = mapped_column(Text, primary_key=True)
    lis_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icpsr_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    govtrack_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    thomas_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fec_ids: Mapped[Optional[List[str]]] = mapped_column(ARRAY(Text), nullable=True)
    first_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    full_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    party: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    chamber: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    state: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    state_full: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    district: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    in_office: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    birthday: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    website: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    term_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    term_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    senate_class: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    next_election: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    twitter: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    facebook: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    youtube: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fec_committee_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    bills: Mapped[List["Bill"]] = relationship("Bill", back_populates="sponsor")
    vote_positions: Mapped[List["BillVotePosition"]] = relationship(
        "BillVotePosition", back_populates="legislator"
    )
    committee_memberships: Mapped[List["CommitteeMembership"]] = relationship(
        "CommitteeMembership", back_populates="legislator"
    )
    scores: Mapped[List["MemberScore"]] = relationship("MemberScore", back_populates="legislator")


class Bill(Base):
    __tablename__ = "bills"
    __table_args__ = {"schema": "congress"}

    bill_id: Mapped[str] = mapped_column(Text, primary_key=True)
    congress: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    bill_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    bill_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    combined_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    policy_area: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    topics: Mapped[Optional[List[str]]] = mapped_column(
        ARRAY(Text), nullable=True, server_default="{}"
    )
    sponsor_bioguide_id: Mapped[Optional[str]] = mapped_column(
        Text, ForeignKey("congress.legislators.bioguide_id"), nullable=True
    )
    sponsor_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sponsor_party: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    introduced_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    last_action_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_action_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    congress_gov_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    referenced_agencies: Mapped[Optional[List[str]]] = mapped_column(ARRAY(Text), nullable=True)
    referenced_laws: Mapped[Optional[List[str]]] = mapped_column(ARRAY(Text), nullable=True)
    referenced_usc: Mapped[Optional[List[str]]] = mapped_column(ARRAY(Text), nullable=True)
    synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    sponsor: Mapped[Optional["Legislator"]] = relationship("Legislator", back_populates="bills")
    vote_summaries: Mapped[List["BillVoteSummary"]] = relationship(
        "BillVoteSummary", back_populates="bill"
    )


class BillVoteSummary(Base):
    __tablename__ = "bill_vote_summaries"
    __table_args__ = {"schema": "congress"}

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    bill_id: Mapped[Optional[str]] = mapped_column(
        Text, ForeignKey("congress.bills.bill_id"), nullable=True
    )
    congress: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    chamber: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    question: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    required: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    yea_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, server_default="0")
    nay_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, server_default="0")
    present_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, server_default="0")
    not_voting_total: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, server_default="0"
    )
    yea_democrat: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, server_default="0")
    nay_democrat: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, server_default="0")
    yea_republican: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, server_default="0"
    )
    nay_republican: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, server_default="0"
    )
    yea_independent: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, server_default="0"
    )
    nay_independent: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, server_default="0"
    )
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    bill: Mapped[Optional["Bill"]] = relationship("Bill", back_populates="vote_summaries")
    positions: Mapped[List["BillVotePosition"]] = relationship(
        "BillVotePosition", back_populates="vote_summary"
    )


class BillVotePosition(Base):
    __tablename__ = "bill_vote_positions"
    __table_args__ = {"schema": "congress"}

    vote_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("congress.bill_vote_summaries.id", ondelete="CASCADE"),
        primary_key=True,
    )
    bioguide_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("congress.legislators.bioguide_id", ondelete="CASCADE"),
        primary_key=True,
    )
    position: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    vote_summary: Mapped["BillVoteSummary"] = relationship(
        "BillVoteSummary", back_populates="positions"
    )
    legislator: Mapped["Legislator"] = relationship(
        "Legislator", back_populates="vote_positions"
    )


class Committee(Base):
    __tablename__ = "committees"
    __table_args__ = {"schema": "congress"}

    thomas_id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    chamber: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    committee_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    parent_id: Mapped[Optional[str]] = mapped_column(
        Text, ForeignKey("congress.committees.thomas_id"), nullable=True
    )
    url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    parent: Mapped[Optional["Committee"]] = relationship(
        "Committee", remote_side="Committee.thomas_id", back_populates="subcommittees"
    )
    subcommittees: Mapped[List["Committee"]] = relationship(
        "Committee", back_populates="parent"
    )
    memberships: Mapped[List["CommitteeMembership"]] = relationship(
        "CommitteeMembership", back_populates="committee"
    )


class CommitteeMembership(Base):
    __tablename__ = "committee_memberships"
    __table_args__ = {"schema": "congress"}

    bioguide_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("congress.legislators.bioguide_id", ondelete="CASCADE"),
        primary_key=True,
    )
    committee_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("congress.committees.thomas_id", ondelete="CASCADE"),
        primary_key=True,
    )
    rank: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    role: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    legislator: Mapped["Legislator"] = relationship(
        "Legislator", back_populates="committee_memberships"
    )
    committee: Mapped["Committee"] = relationship("Committee", back_populates="memberships")


class MemberScore(Base):
    __tablename__ = "member_scores"
    __table_args__ = {"schema": "congress"}

    bioguide_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("congress.legislators.bioguide_id", ondelete="CASCADE"),
        primary_key=True,
    )
    congress: Mapped[int] = mapped_column(Integer, primary_key=True)
    nominate_dim1: Mapped[Optional[float]] = mapped_column(nullable=True)
    nominate_dim2: Mapped[Optional[float]] = mapped_column(nullable=True)
    synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    legislator: Mapped["Legislator"] = relationship("Legislator", back_populates="scores")
