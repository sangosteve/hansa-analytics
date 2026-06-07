from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class HansaOAuthToken(Base):
    """Single-row OAuth token store per provider (provider='hansa')."""
    __tablename__ = "hansa_oauth_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    access_token_enc: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token_enc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    token_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    scope: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class RefreshSettings(Base):
    """Singleton settings row (id=1). Created on first GET if missing."""
    __tablename__ = "refresh_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    active_companies: Mapped[list] = mapped_column(JSON, nullable=False, default=lambda: ["3", "4", "5", "6"])
    refresh_mode: Mapped[str] = mapped_column(String(50), nullable=False, default="last_success_buffer")
    safety_buffer_days: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    last_n_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    include_master: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    include_invoices: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    include_deliveries: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    include_orders: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    include_receipts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    include_gl_accounts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rebuild_facts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rebuild_movement: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rebuild_stock: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    schedule_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    schedule_frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="daily")
    schedule_time: Mapped[str] = mapped_column(String(10), nullable=False, default="02:00")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class RefreshJob(Base):
    """One row per full refresh pipeline execution (manual or scheduled)."""
    __tablename__ = "refresh_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    trigger_type: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
    companies: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    date_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    date_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    total_records: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    step_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class RefreshRun(Base):
    __tablename__ = "refresh_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    company_no: Mapped[str] = mapped_column(String(20), nullable=False, default="1")
    refresh_type: Mapped[str] = mapped_column(String(100), nullable=False)

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(String(50), nullable=False, default="running")
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    date_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    date_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    records_processed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ItemGroup(Base):
    __tablename__ = "item_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    company_no: Mapped[str] = mapped_column(String(20), nullable=False, default="1")
    code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    comment: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("company_no", "code", name="uq_item_groups_company_code"),
    )


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    company_no: Mapped[str] = mapped_column(String(20), nullable=False, default="1")

    code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    alternative_code: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        index=True,
    )
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    item_group_code: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        index=True,
    )

    weight: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    unit_coefficient: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 6),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("company_no", "code", name="uq_items_company_code"),
    )


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    company_no: Mapped[str] = mapped_column(String(20), nullable=False, default="1")

    code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    cu_type: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("company_no", "code", name="uq_customers_company_code"),
    )


class SalesTransaction(Base):
    __tablename__ = "sales_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    company_no: Mapped[str] = mapped_column(String(20), nullable=False, default="1")

    transaction_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    source_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    source_no: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    source_row_hash: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    order_no: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    customer_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    customer_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    item_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    item_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    item_group_code: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        index=True,
    )
    item_group_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    salesperson: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)

    source_weight: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    item_weight: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    unit_coefficient: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)

    tonnes: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)

    pay_deal: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    credit_mark: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    invoice_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    ok_flag: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    upd_stock_flag: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    not_upd_stock_flag: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "company_no",
            "source_type",
            "source_row_hash",
            name="uq_sales_transactions_source_row_hash",
        ),
    )

class CustomerProductGroupMovement(Base):
    __tablename__ = "customer_product_group_movement"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    company_no: Mapped[str] = mapped_column(String(20), nullable=False, default="1")

    customer_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    customer_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    product_group_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    product_group_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    buying_months_6m: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    recent_buying_months_3m: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    avg_monthly_tonnes_6m: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    current_month_tonnes: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    expected_mtd_tonnes: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)

    tonnage_gap: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    gap_percent: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)

    last_purchase_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    days_since_last_purchase: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    last_salesperson: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    buyer_status: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    action_band: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "company_no",
            "customer_code",
            "product_group_code",
            name="uq_customer_product_group_movement",
        ),
    )

class HansaInvoiceHeader(Base):
    __tablename__ = "hansa_invoice_headers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    company_no: Mapped[str] = mapped_column(String(20), nullable=False, default="1")

    ser_nr: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    inv_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    cust_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    pay_deal: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ok_flag: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    inv_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    cred_mark: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    sales_man: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    upd_stock_flag: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    order_no: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    # ── Phase 1: Financial enrichment fields ──────────────────────────────────
    pay_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    pay_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    currency_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    cred_inv: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    sum1: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    sum4: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    base_sum4: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)

    source_sequence: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("company_no", "ser_nr", name="uq_hansa_invoice_headers_company_sernr"),
    )


class HansaInvoiceLine(Base):
    __tablename__ = "hansa_invoice_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    company_no: Mapped[str] = mapped_column(String(20), nullable=False, default="1")

    ser_nr: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    row_number: Mapped[str] = mapped_column(String(50), nullable=False)

    art_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    quant: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    not_upd_stock_flag: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    source_row_hash: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "company_no",
            "ser_nr",
            "row_number",
            name="uq_hansa_invoice_lines_company_sernr_row",
        ),
        UniqueConstraint(
            "company_no",
            "source_row_hash",
            name="uq_hansa_invoice_lines_source_hash",
        ),
    )


class HansaDeliveryHeader(Base):
    __tablename__ = "hansa_delivery_headers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    company_no: Mapped[str] = mapped_column(String(20), nullable=False, default="1")

    ser_nr: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    order_nr: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    ship_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    cust_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    ok_flag: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    weight: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)

    source_sequence: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("company_no", "ser_nr", name="uq_hansa_delivery_headers_company_sernr"),
    )


class HansaDeliveryLine(Base):
    __tablename__ = "hansa_delivery_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    company_no: Mapped[str] = mapped_column(String(20), nullable=False, default="1")

    ser_nr: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    row_number: Mapped[str] = mapped_column(String(50), nullable=False)

    art_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    ship: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    source_row_hash: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "company_no",
            "ser_nr",
            "row_number",
            name="uq_hansa_delivery_lines_company_sernr_row",
        ),
        UniqueConstraint(
            "company_no",
            "source_row_hash",
            name="uq_hansa_delivery_lines_source_hash",
        ),
    )


class ItemStockStatus(Base):
    """
    Snapshot of stock levels from Hansa ItemStatusVc register.
    One row per (company_no, art_code, location).
    Replaced wholesale on each refresh for the given company.
    """
    __tablename__ = "item_stock_status"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    company_no: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    art_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    location: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    item_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    item_group_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    item_group_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    instock: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    ord_out: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    po_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    rsrv_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    in_shipment: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    weighed_av_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("company_no", "art_code", "location", name="uq_item_stock_company_art_loc"),
    )


class FactSalesLine(Base):
    __tablename__ = "fact_sales_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    company_no: Mapped[str] = mapped_column(String(20), nullable=False, default="1")

    transaction_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    source_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    source_no: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    source_row_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    source_row_hash: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    order_no: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    customer_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    customer_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    item_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    item_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    item_group_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    item_group_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    salesperson: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)

    item_weight: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    unit_coefficient: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)

    tonnes: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)

    pay_deal: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    credit_mark: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    invoice_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "company_no",
            "source_type",
            "source_row_hash",
            name="uq_fact_sales_lines_source_hash",
        ),
    )


# ── Phase 1: New models ────────────────────────────────────────────────────────

class HansaReceipt(Base):
    """
    Customer payment receipts (IPVc register) — one row per receipt per company.
    Receipts are fetched per company over a date range.
    """
    __tablename__ = "hansa_receipts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    company_no: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    ser_nr: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    cust_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    trans_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    invoice_nr: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    inv_curncy: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    pay_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    rec_curncy: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    rec_val: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    ok_flag: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("company_no", "ser_nr", name="uq_hansa_receipts_company_sernr"),
    )


class HansaOrderHeader(Base):
    """
    Sales order headers (SOVc register) — one row per order per company.
    """
    __tablename__ = "hansa_order_headers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    company_no: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    ser_nr: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    cust_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    order_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    sales_man: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    ok_flag: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    currency_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    pay_deal: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    sum1: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    sum4: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    base_sum4: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)

    source_sequence: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("company_no", "ser_nr", name="uq_hansa_order_headers_company_sernr"),
    )


class HansaOrderLine(Base):
    """
    Sales order lines — one row per line item per order per company.
    """
    __tablename__ = "hansa_order_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    company_no: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    ser_nr: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    row_number: Mapped[str] = mapped_column(String(50), nullable=False)

    art_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    quant: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    price: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    disc: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)

    source_row_hash: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "company_no",
            "ser_nr",
            "row_number",
            name="uq_hansa_order_lines_company_sernr_row",
        ),
        UniqueConstraint(
            "company_no",
            "source_row_hash",
            name="uq_hansa_order_lines_source_hash",
        ),
    )


class GlAccount(Base):
    """
    General Ledger accounts (AccVc register) — fetched from master company (1) only.
    Used as a dimension for financial P&L analytics.
    """
    __tablename__ = "gl_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    company_no: Mapped[str] = mapped_column(String(20), nullable=False, default="1")
    acc_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    comment: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    acc_type: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    curncy: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    group_acc: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("company_no", "acc_number", name="uq_gl_accounts_company_accnr"),
    )
