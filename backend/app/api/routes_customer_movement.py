from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import asc, desc, select
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.config import settings
from app.core.filters import INTERNAL_CUSTOMER_CODES

from app.db.database import get_db
from app.db.models import CustomerProductGroupMovement

router = APIRouter(prefix="/api/customer-movement", tags=["Customer Movement"])


@router.get("")
def get_customer_movement(
    db: Session = Depends(get_db),
    buyer_status: Optional[str] = Query(default=None),
    action_band: Optional[str] = Query(default=None),
    product_group_code: Optional[str] = Query(default=None),
    customer_code: Optional[str] = Query(default=None),
    salesperson: Optional[str] = Query(default=None),
    sale_scope: str = Query(default="all"),
):
    query = select(CustomerProductGroupMovement)

    if buyer_status:
        query = query.where(CustomerProductGroupMovement.buyer_status == buyer_status)
    if action_band:
        query = query.where(CustomerProductGroupMovement.action_band == action_band)
    if product_group_code:
        query = query.where(CustomerProductGroupMovement.product_group_code == product_group_code)
    if customer_code:
        query = query.where(CustomerProductGroupMovement.customer_code == customer_code)
    if salesperson:
        query = query.where(CustomerProductGroupMovement.last_salesperson == salesperson)

    if sale_scope == "internal":
        query = query.where(CustomerProductGroupMovement.customer_code.in_(INTERNAL_CUSTOMER_CODES))
    elif sale_scope == "external":
        query = query.where(CustomerProductGroupMovement.customer_code.notin_(INTERNAL_CUSTOMER_CODES))

    query = query.order_by(
        asc(CustomerProductGroupMovement.action_band),
        asc(CustomerProductGroupMovement.tonnage_gap),
        desc(CustomerProductGroupMovement.days_since_last_purchase),
    )

    rows = db.execute(query).scalars().all()

    return {
        "count": len(rows),
        "sale_scope": sale_scope,
        "data": [
            {
                "id": row.id,
                "customer_code": row.customer_code,
                "customer_name": row.customer_name,
                "product_group_code": row.product_group_code,
                "product_group_name": row.product_group_name,
                "buying_months_6m": row.buying_months_6m,
                "recent_buying_months_3m": row.recent_buying_months_3m,
                "avg_monthly_tonnes_6m": float(row.avg_monthly_tonnes_6m or 0),
                "current_month_tonnes": float(row.current_month_tonnes or 0),
                "expected_mtd_tonnes": float(row.expected_mtd_tonnes or 0) if row.expected_mtd_tonnes is not None else None,
                "tonnage_gap": float(row.tonnage_gap or 0) if row.tonnage_gap is not None else None,
                "gap_percent": float(row.gap_percent or 0) if row.gap_percent is not None else None,
                "last_purchase_date": row.last_purchase_date,
                "days_since_last_purchase": row.days_since_last_purchase,
                "last_salesperson": row.last_salesperson,
                "last_location": row.last_location,
                "buyer_status": row.buyer_status,
                "action_band": row.action_band,
            }
            for row in rows
        ],
    }


@router.get("/{customer_code}/product-groups/{product_group_code}/items")
def get_customer_product_group_items(
    customer_code: str,
    product_group_code: str,
    db: Session = Depends(get_db),
):
    company_no = settings.hansa_company_no

    query = text(
        """
        WITH as_of AS (
            SELECT
                COALESCE(MAX(transaction_date), CURRENT_DATE)::date AS today
            FROM sales_transactions
            WHERE company_no = :company_no
        ),

        params AS (
            SELECT
                today,
                date_trunc('month', today)::date AS current_month_start,
                (date_trunc('month', today) - interval '6 months')::date AS last_6m_start
            FROM as_of
        )

        SELECT
            st.item_code,
            MAX(st.item_name) AS item_name,
            MAX(st.item_group_code) AS product_group_code,
            MAX(st.item_group_name) AS product_group_name,

            SUM(st.tonnes) AS total_tonnes,

            SUM(
                CASE
                    WHEN st.transaction_date >= p.current_month_start
                     AND st.transaction_date <= p.today
                    THEN st.tonnes
                    ELSE 0
                END
            ) AS current_month_tonnes,

            SUM(
                CASE
                    WHEN st.transaction_date >= p.last_6m_start
                     AND st.transaction_date <= p.today
                    THEN st.tonnes
                    ELSE 0
                END
            ) AS last_6m_tonnes,

            MAX(st.transaction_date) AS last_purchase_date,
            COUNT(*) AS transaction_rows

        FROM sales_transactions st
        CROSS JOIN params p

        WHERE st.company_no = :company_no
          AND st.customer_code = :customer_code
          AND st.item_group_code = :product_group_code
          AND st.transaction_date >= p.last_6m_start
          AND st.transaction_date <= p.today

        GROUP BY st.item_code
        ORDER BY total_tonnes DESC;
        """
    )

    rows = db.execute(
        query,
        {
            "company_no": company_no,
            "customer_code": customer_code,
            "product_group_code": product_group_code,
        },
    ).mappings().all()

    return {
        "customer_code": customer_code,
        "product_group_code": product_group_code,
        "count": len(rows),
        "data": [
            {
                "item_code": row["item_code"],
                "item_name": row["item_name"],
                "product_group_code": row["product_group_code"],
                "product_group_name": row["product_group_name"],
                "total_tonnes": float(row["total_tonnes"] or 0),
                "current_month_tonnes": float(row["current_month_tonnes"] or 0),
                "last_6m_tonnes": float(row["last_6m_tonnes"] or 0),
                "last_purchase_date": row["last_purchase_date"],
                "transaction_rows": row["transaction_rows"],
            }
            for row in rows
        ],
    }
