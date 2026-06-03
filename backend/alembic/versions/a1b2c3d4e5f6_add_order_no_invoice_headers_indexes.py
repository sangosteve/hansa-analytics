"""add order_no to invoice headers and performance indexes

Adds:
- hansa_invoice_headers.order_no (for delivery→invoice salesperson attribution)
- Composite performance indexes on fact_sales_lines for common query patterns
- Index on hansa_delivery_headers.order_nr for join performance

Revision ID: a1b2c3d4e5f6
Revises: 8598c49cd9d3
Create Date: 2026-06-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "8598c49cd9d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add order_no to invoice headers so deliveries can be linked to their
    # originating invoice for salesperson attribution.
    op.add_column(
        "hansa_invoice_headers",
        sa.Column("order_no", sa.String(length=100), nullable=True),
    )
    op.create_index(
        "ix_hansa_invoice_headers_order_no",
        "hansa_invoice_headers",
        ["order_no"],
        unique=False,
    )

    # ── Composite performance indexes on fact_sales_lines ──────────────────
    # These cover the most common filter patterns used by dashboard queries.
    op.create_index(
        "ix_fsl_company_date",
        "fact_sales_lines",
        ["company_no", "transaction_date"],
        unique=False,
    )
    op.create_index(
        "ix_fsl_company_group_date",
        "fact_sales_lines",
        ["company_no", "item_group_code", "transaction_date"],
        unique=False,
    )
    op.create_index(
        "ix_fsl_company_customer_date",
        "fact_sales_lines",
        ["company_no", "customer_code", "transaction_date"],
        unique=False,
    )
    op.create_index(
        "ix_fsl_company_salesperson_date",
        "fact_sales_lines",
        ["company_no", "salesperson", "transaction_date"],
        unique=False,
    )

    # ix_hansa_delivery_headers_order_nr already exists from the initial migration
    # — skip creating it again to avoid a DuplicateTable error.
    conn = op.get_bind()
    exists = conn.execute(
        sa.text(
            "SELECT 1 FROM pg_indexes WHERE indexname = 'ix_hansa_delivery_headers_order_nr'"
        )
    ).scalar()
    if not exists:
        op.create_index(
            "ix_hansa_delivery_headers_order_nr",
            "hansa_delivery_headers",
            ["order_nr"],
            unique=False,
        )


def downgrade() -> None:
    conn = op.get_bind()
    exists = conn.execute(
        sa.text(
            "SELECT 1 FROM pg_indexes WHERE indexname = 'ix_hansa_delivery_headers_order_nr'"
        )
    ).scalar()
    if exists:
        op.drop_index("ix_hansa_delivery_headers_order_nr", table_name="hansa_delivery_headers")
    op.drop_index("ix_fsl_company_salesperson_date", table_name="fact_sales_lines")
    op.drop_index("ix_fsl_company_customer_date", table_name="fact_sales_lines")
    op.drop_index("ix_fsl_company_group_date", table_name="fact_sales_lines")
    op.drop_index("ix_fsl_company_date", table_name="fact_sales_lines")
    op.drop_index("ix_hansa_invoice_headers_order_no", table_name="hansa_invoice_headers")
    op.drop_column("hansa_invoice_headers", "order_no")
