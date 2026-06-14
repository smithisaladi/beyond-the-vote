"""SQLAlchemy 2.0 mapped models for the fec schema."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import BigInteger, CHAR, Numeric, SmallInteger, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models.congress import Base


class PacToCandidate(Base):
    __tablename__ = "pac_to_candidate"
    __table_args__ = {"schema": "fec"}

    sub_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    cmte_id: Mapped[str] = mapped_column(Text, nullable=False)
    cand_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    transaction_tp: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    transaction_amt: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    transaction_dt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cycle: Mapped[int] = mapped_column(SmallInteger, nullable=False)


class IndependentExpenditure(Base):
    __tablename__ = "independent_expenditures"
    __table_args__ = {"schema": "fec"}

    sub_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    cmte_id: Mapped[str] = mapped_column(Text, nullable=False)
    cand_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sup_opp: Mapped[str] = mapped_column(CHAR(1), nullable=False)
    transaction_tp: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    transaction_amt: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    transaction_dt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cycle: Mapped[int] = mapped_column(SmallInteger, nullable=False)


class Candidate(Base):
    __tablename__ = "candidates"
    __table_args__ = {"schema": "fec"}

    cand_id: Mapped[str] = mapped_column(Text, primary_key=True)
    cand_name: Mapped[str] = mapped_column(Text)
    cand_party: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cand_office: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cand_state: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cand_district: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cycle: Mapped[int] = mapped_column(SmallInteger)


class CmteName(Base):
    __tablename__ = "cmte_names"
    __table_args__ = {"schema": "fec"}

    cmte_id: Mapped[str] = mapped_column(Text, primary_key=True)
    cmte_name: Mapped[str] = mapped_column(Text, nullable=False)
    connected_org: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
