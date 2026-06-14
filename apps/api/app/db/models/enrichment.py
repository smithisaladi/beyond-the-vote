"""SQLAlchemy 2.0 mapped models for enrichment data (embeddings, etc.)."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import ARRAY, BigInteger, Boolean, DateTime, ForeignKey, Integer, Numeric, Text
from sqlalchemy.dialects.postgresql import REAL
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models.congress import Base


class BillEmbedding(Base):
    __tablename__ = "bill_embeddings"
    __table_args__ = {"schema": "enrichment"}

    bill_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("congress.bills.bill_id", ondelete="CASCADE"),
        primary_key=True,
    )
    embedding: Mapped[Optional[object]] = mapped_column(Vector(384), nullable=True)
    model_version: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    has_summary: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class DonorCanonical(Base):
    __tablename__ = "donor_canonical"
    __table_args__ = {"schema": "enrichment"}

    canonical_id: Mapped[str] = mapped_column(Text, primary_key=True)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    employer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    state: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    zip5: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default="0")
    contribution_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    cmte_ids: Mapped[List[str]] = mapped_column(ARRAY(Text), nullable=False, server_default="{}")
    confidence: Mapped[float] = mapped_column(REAL, nullable=False)
    model_version: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class EmployerCanonical(Base):
    __tablename__ = "employer_canonical"
    __table_args__ = {"schema": "enrichment"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    canonical_employer_id: Mapped[str] = mapped_column(Text, nullable=False)
    raw_string: Mapped[str] = mapped_column(Text, nullable=False)
    canonical_name: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(REAL, nullable=False)
    model_version: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class EmployerIndustry(Base):
    __tablename__ = "employer_industry"
    __table_args__ = {"schema": "enrichment"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    canonical_employer_id: Mapped[str] = mapped_column(Text, nullable=False)
    industry: Mapped[str] = mapped_column(Text, nullable=False)
    sub_industry: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    confidence: Mapped[float] = mapped_column(REAL, nullable=False)
    model_version: Mapped[str] = mapped_column(Text, nullable=False)
    classified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
