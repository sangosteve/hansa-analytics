"""add item_stock_status table

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-06-03

"""
from alembic import op
import sqlalchemy as sa

revision = "c3d4e5f6a7b8"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "item_stock_status",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_no", sa.String(20), nullable=False),
        sa.Column("art_code", sa.String(100), nullable=False),
        sa.Column("location", sa.String(50), nullable=False),
        sa.Column("item_name", sa.String(255), nullable=True),
        sa.Column("item_group_code", sa.String(100), nullable=True),
        sa.Column("item_group_name", sa.String(255), nullable=True),
        sa.Column("instock", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("ord_out", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("po_qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("rsrv_qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("in_shipment", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("weighed_av_price", sa.Numeric(18, 4), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_no", "art_code", "location", name="uq_item_stock_company_art_loc"),
    )
    op.create_index("ix_item_stock_company_no", "item_stock_status", ["company_no"])
    op.create_index("ix_item_stock_art_code", "item_stock_status", ["art_code"])
    op.create_index("ix_item_stock_location", "item_stock_status", ["location"])
    op.create_index("ix_item_stock_group_code", "item_stock_status", ["item_group_code"])


def downgrade() -> None:
    op.drop_table("item_stock_status")
