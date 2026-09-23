from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, Index, Integer, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Page(Base):
    __tablename__ = "pages"

    id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=True), primary_key=True
    )
    page_key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    draft_schema: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    published_version_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("page_versions.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PageVersion(Base):
    __tablename__ = "page_versions"
    __table_args__ = (
        UniqueConstraint("page_id", "version", name="uq_page_versions_page_version"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=True), primary_key=True
    )
    page_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("pages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    schema: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TelemetryObservation(Base):
    __tablename__ = "telemetry_observations"
    __table_args__ = (
        Index(
            "ix_telemetry_observations_data_key_received_at_id",
            "data_key", "received_at", "id",
        ),
        Index("ix_telemetry_observations_received_at", "received_at"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=True), primary_key=True
    )
    data_key: Mapped[str] = mapped_column(Text, nullable=False)
    value: Mapped[float] = mapped_column(nullable=False)
    source_timestamp: Mapped[str] = mapped_column(Text, nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
