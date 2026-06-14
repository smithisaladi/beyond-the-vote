"""SQLAlchemy 2.0 mapped models for the analytics schema."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import ARRAY, BigInteger, DateTime, Integer, Numeric, SmallInteger, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models.congress import Base


class MoneyFlowAttribution(Base):
    __tablename__ = "money_flow_attribution"
    __table_args__ = {"schema": "analytics"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    destination_committee_id: Mapped[str] = mapped_column(Text, nullable=False)
    origin_entity_id: Mapped[str] = mapped_column(Text, nullable=False)
    origin_entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    attributed_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    hop_count: Mapped[int] = mapped_column(Integer, nullable=False)
    path: Mapped[Optional[List[str]]] = mapped_column(ARRAY(Text), nullable=True)
    cycle: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    model_version: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
