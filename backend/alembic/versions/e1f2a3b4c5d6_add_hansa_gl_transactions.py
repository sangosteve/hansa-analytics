"""add hansa_gl_transactions table

Revision ID: e1f2a3b4c5d6
Revises: 65d9b37e342b
Create Date: 2026-06-07

GL transaction lines from Hansa TRVc register.
Used for P&L analytics: Revenue, Cost of Sales, OPEX, Gross Profit, Net Profit.
"""

from alembic import op
import sqlalchemy as sa

revision = "e1f2a3b4c5d6"
down_revision = "65d9b37e342b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "refresh_settings",
        sa.Column("include_gl_transactions", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "hansa_gl_transactions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_no", sa.String(20), nullable=False),
        sa.Column("trans_nr", sa.String(100), nullable=False),
        sa.Column("number", sa.String(100), nullable=True),
        sa.Column("acc_number", sa.String(50), nullable=False),
        sa.Column("trans_date", sa.Date(), nullable=True),
        sa.Column("reg_date", sa.Date(), nullable=True),
        sa.Column("deb_val", sa.Numeric(18, 4), nullable=True),
        sa.Column("cred_val", sa.Numeric(18, 4), nullable=True),
        sa.Column("deb_val2", sa.Numeric(18, 4), nullable=True),
        sa.Column("cred_val2", sa.Numeric(18, 4), nullable=True),
        sa.Column("comment", sa.String(500), nullable=True),
        sa.Column("vat_code", sa.String(50), nullable=True),
        sa.Column("qty", sa.Numeric(18, 4), nullable=True),
        sa.Column("curncy", sa.String(20), nullable=True),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_no", "trans_nr", name="uq_hansa_gl_transactions_co_transnr"),
    )
    op.create_index("ix_hansa_gl_transactions_company_no", "hansa_gl_transactions", ["company_no"])
    op.create_index("ix_hansa_gl_transactions_acc_number", "hansa_gl_transactions", ["acc_number"])
    op.create_index("ix_hansa_gl_transactions_trans_date", "hansa_gl_transactions", ["trans_date"])


def downgrade() -> None:
    op.drop_column("refresh_settings", "include_gl_transactions")
    op.drop_index("ix_hansa_gl_transactions_trans_date", "hansa_gl_transactions")
    op.drop_index("ix_hansa_gl_transactions_acc_number", "hansa_gl_transactions")
    op.drop_index("ix_hansa_gl_transactions_company_no", "hansa_gl_transactions")
    op.drop_table("hansa_gl_transactions")
