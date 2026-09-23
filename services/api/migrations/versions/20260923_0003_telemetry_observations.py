"""Persist telemetry observations used as alarm evidence.

Revision ID: 20260923_0003
Revises: 20260914_0002
Create Date: 2026-09-23
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260923_0003"
down_revision: str | None = "20260914_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "telemetry_observations",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("data_key", sa.Text(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("source_timestamp", sa.Text(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_telemetry_observations_data_key_received_at_id",
        "telemetry_observations",
        ["data_key", "received_at", "id"],
    )
    op.create_index(
        "ix_telemetry_observations_received_at",
        "telemetry_observations",
        ["received_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_telemetry_observations_received_at", table_name="telemetry_observations"
    )
    op.drop_index(
        "ix_telemetry_observations_data_key_received_at_id",
        table_name="telemetry_observations",
    )
    op.drop_table("telemetry_observations")
