"""
Predictive & advanced analytics endpoints.

Provides data-driven forward-looking insights computed directly from
the fact_sales_lines table. All projections use the maximum transaction
date in the dataset as the reference "today" so results are meaningful
even when the data does not extend to the current calendar date.

Endpoints:
  GET /api/analytics/predictive   — MTD projection, trend signals,
                                    customer lapse risk, products to push
"""

import calendar
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get("/predictive")
def get_predictive_insights(
    company_no: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    Returns a set of predictive / forward-looking signals:

    - mtd_projection: current month tonnes extrapolated to month end
    - product_group_trends: 3-month vs prior-3-month direction per group
    - customer_lapse_risk: top customers at risk of churning
    - products_to_push: items with strong historical demand but recent decline
    - salesperson_trends: rep performance direction (current vs prior 3m)
    """
    company_no = company_no or settings.hansa_company_no

    # Reference date = max transaction date in data (data ends Feb 2026)
    ref_row = db.execute(
        text("SELECT MAX(transaction_date) FROM fact_sales_lines WHERE company_no = :c"),
        {"c": company_no},
    ).scalar()

    if not ref_row:
        return {
            "company_no": company_no,
            "reference_date": None,
            "mtd_projection": None,
            "product_group_trends": [],
            "customer_lapse_risk": [],
            "products_to_push": [],
            "salesperson_trends": [],
        }

    ref_date: date = ref_row

    # ── MTD projection ───────────────────────────────────────────────────────
    # How many days have elapsed in the current month vs total days?
    # Project from that rate to month end.
    current_month_start = ref_date.replace(day=1)
    days_in_month = calendar.monthrange(ref_date.year, ref_date.month)[1]
    days_elapsed = ref_date.day  # inclusive of ref_date

    mtd_query = text("""
        SELECT
            SUM(tonnes)::float          AS actual_tonnes,
            date_trunc('month', transaction_date)::date AS month_start
        FROM fact_sales_lines
        WHERE company_no        = :company_no
          AND transaction_date >= :month_start
          AND transaction_date <= :ref_date
        GROUP BY month_start
    """)
    mtd_row = db.execute(
        mtd_query,
        {
            "company_no": company_no,
            "month_start": current_month_start,
            "ref_date": ref_date,
        },
    ).mappings().first()

    mtd_actual = float(mtd_row["actual_tonnes"] or 0) if mtd_row else 0.0
    projected_eom = round(mtd_actual / days_elapsed * days_in_month, 2) if days_elapsed > 0 else 0.0

    # Same month last year
    lly_start = current_month_start.replace(year=current_month_start.year - 1)
    lly_end = lly_start.replace(
        day=min(days_elapsed, calendar.monthrange(lly_start.year, lly_start.month)[1])
    )
    lly_row = db.execute(
        text("""
            SELECT SUM(tonnes)::float AS tonnes
            FROM fact_sales_lines
            WHERE company_no        = :company_no
              AND transaction_date >= :start
              AND transaction_date <= :end
        """),
        {"company_no": company_no, "start": lly_start, "end": lly_end},
    ).scalar()
    lly_tonnes = float(lly_row or 0)
    yoy_pct = round((mtd_actual - lly_tonnes) / lly_tonnes * 100, 1) if lly_tonnes else None

    mtd_projection = {
        "month": ref_date.strftime("%B %Y"),
        "days_elapsed": days_elapsed,
        "days_in_month": days_in_month,
        "actual_tonnes": round(mtd_actual, 2),
        "projected_eom_tonnes": projected_eom,
        "same_period_last_year_tonnes": round(lly_tonnes, 2),
        "yoy_pct_change": yoy_pct,
    }

    # ── Product group trends ─────────────────────────────────────────────────
    # Compare 3-month tonnage to prior 3-month tonnage per group.
    # Periods are defined relative to ref_date.
    pg_trend_query = text("""
        WITH periods AS (
            SELECT
                item_group_code,
                item_group_name,
                SUM(CASE
                    WHEN transaction_date >= :period2_start
                     AND transaction_date <= :ref_date        THEN tonnes ELSE 0
                END)::float AS current_3m,
                SUM(CASE
                    WHEN transaction_date >= :period1_start
                     AND transaction_date <  :period2_start   THEN tonnes ELSE 0
                END)::float AS prior_3m
            FROM fact_sales_lines
            WHERE company_no        = :company_no
              AND transaction_date >= :period1_start
              AND item_group_code IS NOT NULL
            GROUP BY item_group_code, item_group_name
        )
        SELECT
            item_group_code,
            COALESCE(item_group_name, item_group_code) AS item_group_name,
            current_3m,
            prior_3m,
            ROUND(
                CASE
                    WHEN prior_3m > 0
                    THEN (current_3m - prior_3m) / prior_3m * 100
                    ELSE NULL
                END
            ::numeric, 1)::float                        AS pct_change,
            CASE
                WHEN prior_3m = 0 AND current_3m > 0 THEN 'new'
                WHEN prior_3m > 0 AND current_3m = 0 THEN 'stopped'
                WHEN current_3m >= prior_3m * 1.10    THEN 'growing'
                WHEN current_3m <= prior_3m * 0.90    THEN 'declining'
                ELSE 'stable'
            END                                         AS trend
        FROM periods
        WHERE current_3m > 0 OR prior_3m > 0
        ORDER BY ABS(COALESCE(current_3m, 0) - COALESCE(prior_3m, 0)) DESC
        LIMIT 20
    """)

    # 3m window: go back ~91 days from ref_date
    from datetime import timedelta
    period2_start = (ref_date - timedelta(days=91)).replace(day=1)
    period1_start = (period2_start - timedelta(days=91)).replace(day=1)

    pg_rows = db.execute(
        pg_trend_query,
        {
            "company_no": company_no,
            "ref_date": ref_date,
            "period2_start": period2_start,
            "period1_start": period1_start,
        },
    ).mappings().all()

    product_group_trends = [
        {
            "code": r["item_group_code"],
            "name": r["item_group_name"],
            "current_3m_tonnes": round(float(r["current_3m"] or 0), 2),
            "prior_3m_tonnes": round(float(r["prior_3m"] or 0), 2),
            "pct_change": float(r["pct_change"]) if r["pct_change"] is not None else None,
            "trend": r["trend"],
        }
        for r in pg_rows
    ]

    # ── Customer lapse risk ──────────────────────────────────────────────────
    # Customers who were active in 6m prior to the last-3m window but
    # have not bought in the last 3 months.
    lapse_query = text("""
        WITH recent AS (
            SELECT DISTINCT customer_code
            FROM fact_sales_lines
            WHERE company_no        = :company_no
              AND transaction_date >= :recent_start
        ),
        active_before AS (
            SELECT
                customer_code,
                MAX(customer_name)             AS customer_name,
                SUM(tonnes)::float             AS tonnes_6m_prior,
                MAX(transaction_date)          AS last_purchase_date,
                COUNT(DISTINCT date_trunc('month', transaction_date)) AS active_months
            FROM fact_sales_lines
            WHERE company_no        = :company_no
              AND transaction_date >= :prior_start
              AND transaction_date <  :recent_start
            GROUP BY customer_code
        )
        SELECT
            ab.customer_code,
            ab.customer_name,
            ab.tonnes_6m_prior,
            ab.last_purchase_date,
            ab.active_months,
            (:ref_date - ab.last_purchase_date) AS days_since_purchase,
            CASE
                WHEN ab.tonnes_6m_prior > 50  THEN 'high'
                WHEN ab.tonnes_6m_prior > 10  THEN 'medium'
                ELSE 'low'
            END                                 AS revenue_tier
        FROM active_before ab
        LEFT JOIN recent r ON r.customer_code = ab.customer_code
        WHERE r.customer_code IS NULL
        ORDER BY ab.tonnes_6m_prior DESC
        LIMIT 20
    """)

    recent_start = period2_start
    prior_start = (recent_start - timedelta(days=182)).replace(day=1)

    lapse_rows = db.execute(
        lapse_query,
        {
            "company_no": company_no,
            "ref_date": ref_date,
            "recent_start": recent_start,
            "prior_start": prior_start,
        },
    ).mappings().all()

    customer_lapse_risk = [
        {
            "customer_code": r["customer_code"],
            "customer_name": r["customer_name"],
            "tonnes_6m_prior": round(float(r["tonnes_6m_prior"] or 0), 2),
            "last_purchase_date": r["last_purchase_date"].isoformat() if r["last_purchase_date"] else None,
            "days_since_purchase": int(r["days_since_purchase"]) if r["days_since_purchase"] else None,
            "active_months_before": int(r["active_months"] or 0),
            "revenue_tier": r["revenue_tier"],
        }
        for r in lapse_rows
    ]

    # ── Products to push ─────────────────────────────────────────────────────
    # Items with high historical tonnage (6m prior) but significant decline
    # in the most recent 3 months — good candidates for sales focus.
    push_query = text("""
        WITH periods AS (
            SELECT
                item_code,
                MAX(item_name) AS item_name,
                MAX(item_group_name) AS item_group_name,
                SUM(CASE WHEN transaction_date >= :recent_start THEN tonnes ELSE 0 END)::float AS recent_3m,
                SUM(CASE WHEN transaction_date <  :recent_start
                          AND transaction_date >= :prior_start  THEN tonnes ELSE 0 END)::float AS prior_3m
            FROM fact_sales_lines
            WHERE company_no        = :company_no
              AND transaction_date >= :prior_start
              AND item_code IS NOT NULL
            GROUP BY item_code
        )
        SELECT
            item_code,
            item_name,
            item_group_name,
            recent_3m,
            prior_3m,
            ROUND(((recent_3m - prior_3m) / NULLIF(prior_3m, 0) * 100)::numeric, 1)::float AS pct_change
        FROM periods
        WHERE prior_3m  > 1.0       -- meaningful historical volume
          AND recent_3m < prior_3m * 0.80  -- dropped 20%+
        ORDER BY (prior_3m - recent_3m) DESC
        LIMIT 15
    """)

    push_rows = db.execute(
        push_query,
        {
            "company_no": company_no,
            "recent_start": recent_start,
            "prior_start": prior_start,
        },
    ).mappings().all()

    products_to_push = [
        {
            "item_code": r["item_code"],
            "item_name": r["item_name"],
            "item_group_name": r["item_group_name"],
            "recent_3m_tonnes": round(float(r["recent_3m"] or 0), 2),
            "prior_3m_tonnes": round(float(r["prior_3m"] or 0), 2),
            "pct_change": float(r["pct_change"]) if r["pct_change"] is not None else None,
        }
        for r in push_rows
    ]

    # ── Salesperson trends ───────────────────────────────────────────────────
    sp_query = text("""
        WITH periods AS (
            SELECT
                COALESCE(NULLIF(TRIM(salesperson), ''), 'Unassigned') AS salesperson,
                SUM(CASE WHEN transaction_date >= :period2_start THEN tonnes ELSE 0 END)::float AS current_3m,
                SUM(CASE WHEN transaction_date >= :period1_start
                          AND transaction_date <  :period2_start THEN tonnes ELSE 0 END)::float AS prior_3m
            FROM fact_sales_lines
            WHERE company_no        = :company_no
              AND transaction_date >= :period1_start
            GROUP BY 1
        )
        SELECT
            salesperson,
            current_3m,
            prior_3m,
            ROUND(
                CASE
                    WHEN prior_3m > 0 THEN (current_3m - prior_3m) / prior_3m * 100
                    ELSE NULL
                END::numeric, 1
            )::float AS pct_change,
            CASE
                WHEN prior_3m = 0 AND current_3m > 0 THEN 'new'
                WHEN current_3m >= prior_3m * 1.10   THEN 'growing'
                WHEN current_3m <= prior_3m * 0.90   THEN 'declining'
                ELSE 'stable'
            END AS trend
        FROM periods
        WHERE current_3m > 0 OR prior_3m > 0
        ORDER BY current_3m DESC
        LIMIT 15
    """)

    sp_rows = db.execute(
        sp_query,
        {
            "company_no": company_no,
            "ref_date": ref_date,
            "period2_start": period2_start,
            "period1_start": period1_start,
        },
    ).mappings().all()

    salesperson_trends = [
        {
            "salesperson": r["salesperson"],
            "current_3m_tonnes": round(float(r["current_3m"] or 0), 2),
            "prior_3m_tonnes": round(float(r["prior_3m"] or 0), 2),
            "pct_change": float(r["pct_change"]) if r["pct_change"] is not None else None,
            "trend": r["trend"],
        }
        for r in sp_rows
    ]

    return {
        "company_no": company_no,
        "reference_date": ref_date.isoformat(),
        "mtd_projection": mtd_projection,
        "product_group_trends": product_group_trends,
        "customer_lapse_risk": customer_lapse_risk,
        "products_to_push": products_to_push,
        "salesperson_trends": salesperson_trends,
    }
