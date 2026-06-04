"""add refresh_settings table

Revision ID: f1a2b3c4d5e6
Revises: c3d4e5f6a7b8
Create Date: 2026-06-04

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f1a2b3c4d5e6"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "refresh_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("active_companies", sa.JSON(), nullable=False, server_default='["3","4","5","6"]'),
        sa.Column("refresh_mode", sa.String(50), nullable=False, server_default="last_success_buffer"),
        sa.Column("safety_buffer_days", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("last_n_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("include_master", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("include_invoices", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("include_deliveries", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("rebuild_facts", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("rebuild_movement", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("rebuild_stock", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("refresh_settings")
