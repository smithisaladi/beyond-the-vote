"""SQLAlchemy 2.0 mapped models for the app schema (user-facing data)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models.congress import Base


class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = {"schema": "app"}

    id: Mapped[object] = mapped_column(UUID(as_uuid=True), primary_key=True)
    display_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    activity_last_seen_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class FollowedPolitician(Base):
    __tablename__ = "followed_politicians"
    __table_args__ = {"schema": "app"}

    user_id: Mapped[object] = mapped_column(UUID(as_uuid=True), primary_key=True)
    politician_id: Mapped[str] = mapped_column(
        Text, ForeignKey("congress.legislators.bioguide_id"), primary_key=True
    )
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class TrackedBill(Base):
    __tablename__ = "tracked_bills"
    __table_args__ = {"schema": "app"}

    user_id: Mapped[object] = mapped_column(UUID(as_uuid=True), primary_key=True)
    bill_id: Mapped[str] = mapped_column(
        Text, ForeignKey("congress.bills.bill_id"), primary_key=True
    )
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class TopicPreference(Base):
    __tablename__ = "topic_preferences"
    __table_args__ = {"schema": "app"}

    user_id: Mapped[object] = mapped_column(UUID(as_uuid=True), primary_key=True)
    topic: Mapped[str] = mapped_column(Text, primary_key=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
