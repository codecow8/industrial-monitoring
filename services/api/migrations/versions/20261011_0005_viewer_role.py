"""Add a viewer role while keeping existing accounts as editors."""
from alembic import op
import sqlalchemy as sa

revision = "20261011_0005"
down_revision = "20261003_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("auth_users", sa.Column("role", sa.Text(), nullable=False, server_default="editor"))
    op.create_check_constraint("ck_auth_users_role", "auth_users", "role IN ('editor', 'viewer')")


def downgrade() -> None:
    op.drop_constraint("ck_auth_users_role", "auth_users", type_="check")
    op.drop_column("auth_users", "role")
