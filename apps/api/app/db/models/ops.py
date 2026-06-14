"""SQLAlchemy 2.0 mapped models for ops schema tables."""
from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlalchemy import Boolean, DateTime, Integer, Interval, Numeric, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.models.congress import Base


class DataFreshness(Base):
    __tablename__ = "data_freshness"
    __table_args__ = {"schema": "ops"}
    schema_name: Mapped[str] = mapped_column(Text, primary_key=True)
    table_name: Mapped[str] = mapped_column(Text, primary_key=True)
    last_updated: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    rows_affected: Mapped[int] = mapped_column(Integer, server_default="0")
    run_id: Mapped[Optional[object]] = mapped_column(UUID(as_uuid=True), nullable=True)
    max_staleness: Mapped[object] = mapped_column(Interval)


class DeadLetter(Base):
    __tablename__ = "dead_letter"
    __table_args__ = {"schema": "ops"}
    id: Mapped[object] = mapped_column(UUID(as_uuid=True), primary_key=True)
    run_id: Mapped[Optional[object]] = mapped_column(UUID(as_uuid=True), nullable=True)
    source_table: Mapped[str] = mapped_column(Text)
    source_key: Mapped[dict] = mapped_column(JSONB)
    raw_data: Mapped[dict] = mapped_column(JSONB)
    error: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    retried_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved: Mapped[bool] = mapped_column(Boolean, server_default="false")


class PipelineMetric(Base):
    __tablename__ = "pipeline_metrics"
    __table_args__ = {"schema": "ops"}
    id: Mapped[object] = mapped_column(UUID(as_uuid=True), primary_key=True)
    run_id: Mapped[object] = mapped_column(UUID(as_uuid=True))
    script_name: Mapped[str] = mapped_column(Text)
    metric_name: Mapped[str] = mapped_column(Text)
    metric_value: Mapped[float] = mapped_column(Numeric)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"
    __table_args__ = {"schema": "ops"}

    id: Mapped[object] = mapped_column(UUID(as_uuid=True), primary_key=True)
    script_name: Mapped[str] = mapped_column(Text, nullable=False)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="running")
    rows_processed: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, server_default="0")
    rows_skipped: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, server_default="0")
    errors: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, server_default="0")
    watermark: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)
    error_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
