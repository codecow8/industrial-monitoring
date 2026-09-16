"""Add immutable page versions and current published pointer.

Revision ID: 20260914_0002
Revises: 20260914_0001
Create Date: 2026-09-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260914_0002"
down_revision: str | None = "20260914_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "page_versions",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("page_id", sa.BigInteger(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("schema", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["page_id"], ["pages.id"], name="fk_page_versions_page_id", ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "page_id", "version", name="uq_page_versions_page_version"
        ),
    )
    op.create_index("ix_page_versions_page_id", "page_versions", ["page_id"])
    op.add_column("pages", sa.Column("published_version_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_pages_published_version_id",
        "pages",
        "page_versions",
        ["published_version_id"],
        ["id"],
        ondelete="SET NULL",
        use_alter=True,
    )
    op.create_index(
        "ix_pages_published_version_id", "pages", ["published_version_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_pages_published_version_id", table_name="pages")
    op.drop_constraint("fk_pages_published_version_id", "pages", type_="foreignkey")
    op.drop_column("pages", "published_version_id")
    op.drop_index("ix_page_versions_page_id", table_name="page_versions")
    op.drop_table("page_versions")

