"""SQLAlchemy 2.0 mapped models for enrichment data (embeddings, etc.)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Text
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
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
