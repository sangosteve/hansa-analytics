"""
Predictive & advanced analytics endpoints.
Supports company_nos (multi-select) and sale_scope (all/external/internal).
"""

import calendar
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.filters import build_company_filter, build_scope_sql
from app.db.database import get_db

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get("/predictive")
def get_predictive_insights(
    company_nos: Optional[list[str]] = Query(default=None),
    company_no: Optional[str] = Query(default=None),
    sale_scope: str = Query(default="all"),
    db: Session = Depends(get_db),
):
    resolved = company_nos or ([company_no] if company_no else None) or [settings.hansa_company_no]
    co_frag, co_params = build_company_filter(resolved)
    scope_frag = build_scope_sql(sale_scope)

    ref_row = db.execute(
        text(f"SELECT MAX(transaction_date) FROM fact_sales_lines WHERE {co_frag} {scope_frag}"),
        co_params,
    ).scalar()

    if not ref_row:
        return {
            "company_nos": resolved,
            "sale_scope": sale_scope,
            "reference_date": None,
            "mtd_projection": None,
            "product_group_trends": [],
            "customer_lapse_risk": [],
            "products_to_push": [],
            "salesperson_trends": [],
        }

    ref_date: date = ref_row
    current_month_start = ref_date.replace(day=1)
    days_in_month = calendar.monthrange(ref_date.year, ref_date.month)[1]
    days_elapsed = ref_date.day

    mtd_row = db.execute(text(f"""
        SELECT SUM(tonnes)::float AS actual_tonnes
        FROM fact_sales_lines
        WHERE {co_frag}
          {scope_frag}
          AND transaction_date >= :month_start
          AND transaction_date <= :ref_date
    """), {**co_params, "month_start": current_month_start, "ref_date": ref_date}).mappings().first()

    mtd_actual = float(mtd_row["actual_tonnes"] or 0) if mtd_row else 0.0
    projected_eom = round(mtd_actual / days_elapsed * days_in_month, 2) if days_elapsed > 0 else 0.0

    lly_start = current_month_start.replace(year=current_month_start.year - 1)
    lly_end = lly_start.replace(
        day=min(days_elapsed, calendar.monthrange(lly_start.year, lly_start.month)[1])
    )
    lly_tonnes = float(db.execute(text(f"""
        SELECT SUM(tonnes)::float FROM fact_sales_lines
        WHERE {co_frag} {scope_frag} AND transaction_date >= :start AND transaction_date <= :end
    """), {**co_params, "start": lly_start, "end": lly_end}).scalar() or 0)

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

    period2_start = (ref_date - timedelta(days=91)).replace(day=1)
    period1_start = (period2_start - timedelta(days=91)).replace(day=1)

    pg_rows = db.execute(text(f"""
        WITH periods AS (
            SELECT
                item_group_code,
                item_group_name,
                SUM(CASE WHEN transaction_date >= :p2 AND transaction_date <= :ref THEN tonnes ELSE 0 END)::float AS current_3m,
                SUM(CASE WHEN transaction_date >= :p1 AND transaction_date <  :p2  THEN tonnes ELSE 0 END)::float AS prior_3m
            FROM fact_sales_lines
            WHERE {co_frag}
              {scope_frag}
              AND transaction_date >= :p1
              AND item_group_code IS NOT NULL
            GROUP BY item_group_code, item_group_name
        )
        SELECT
            item_group_code,
            COALESCE(item_group_name, item_group_code) AS item_group_name,
            current_3m, prior_3m,
            ROUND(CASE WHEN prior_3m > 0 THEN (current_3m - prior_3m) / prior_3m * 100 ELSE NULL END::numeric, 1)::float AS pct_change,
            CASE
                WHEN prior_3m = 0 AND current_3m > 0 THEN 'new'
                WHEN prior_3m > 0 AND current_3m = 0 THEN 'stopped'
                WHEN current_3m >= prior_3m * 1.10   THEN 'growing'
                WHEN current_3m <= prior_3m * 0.90   THEN 'declining'
                ELSE 'stable'
            END AS trend
        FROM periods
        WHERE current_3m > 0 OR prior_3m > 0
        ORDER BY ABS(COALESCE(current_3m, 0) - COALESCE(prior_3m, 0)) DESC
        LIMIT 20
    """), {**co_params, "ref": ref_date, "p2": period2_start, "p1": period1_start}).mappings().all()

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

    recent_start = period2_start
    prior_start = (recent_start - timedelta(days=182)).replace(day=1)

    lapse_rows = db.execute(text(f"""
        WITH recent AS (
            SELECT DISTINCT customer_code
            FROM fact_sales_lines
            WHERE {co_frag} {scope_frag} AND transaction_date >= :recent_start
        ),
        active_before AS (
            SELECT
                customer_code,
                MAX(customer_name)   AS customer_name,
                SUM(tonnes)::float   AS tonnes_6m_prior,
                MAX(transaction_date) AS last_purchase_date,
                COUNT(DISTINCT date_trunc('month', transaction_date)) AS active_months
            FROM fact_sales_lines
            WHERE {co_frag}
              {scope_frag}
              AND transaction_date >= :prior_start
              AND transaction_date <  :recent_start
            GROUP BY customer_code
        )
        SELECT
            ab.customer_code, ab.customer_name, ab.tonnes_6m_prior,
            ab.last_purchase_date, ab.active_months,
            (:ref_date - ab.last_purchase_date) AS days_since_purchase,
            CASE
                WHEN ab.tonnes_6m_prior > 50 THEN 'high'
                WHEN ab.tonnes_6m_prior > 10 THEN 'medium'
                ELSE 'low'
            END AS revenue_tier
        FROM active_before ab
        LEFT JOIN recent r ON r.customer_code = ab.customer_code
        WHERE r.customer_code IS NULL
        ORDER BY ab.tonnes_6m_prior DESC
        LIMIT 20
    """), {**co_params, "recent_start": recent_start, "prior_start": prior_start, "ref_date": ref_date}).mappings().all()

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

    push_rows = db.execute(text(f"""
        WITH periods AS (
            SELECT
                item_code,
                MAX(item_name)       AS item_name,
                MAX(item_group_name) AS item_group_name,
                SUM(CASE WHEN transaction_date >= :recent_start THEN tonnes ELSE 0 END)::float AS recent_3m,
                SUM(CASE WHEN transaction_date <  :recent_start AND transaction_date >= :prior_start THEN tonnes ELSE 0 END)::float AS prior_3m
            FROM fact_sales_lines
            WHERE {co_frag}
              {scope_frag}
              AND transaction_date >= :prior_start
              AND item_code IS NOT NULL
            GROUP BY item_code
        )
        SELECT item_code, item_name, item_group_name, recent_3m, prior_3m,
               ROUND(((recent_3m - prior_3m) / NULLIF(prior_3m, 0) * 100)::numeric, 1)::float AS pct_change
        FROM periods
        WHERE prior_3m > 1.0 AND recent_3m < prior_3m * 0.80
        ORDER BY (prior_3m - recent_3m) DESC
        LIMIT 15
    """), {**co_params, "recent_start": recent_start, "prior_start": prior_start}).mappings().all()

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

    sp_rows = db.execute(text(f"""
        WITH periods AS (
            SELECT
                COALESCE(NULLIF(TRIM(salesperson), ''), 'Unassigned') AS salesperson,
                SUM(CASE WHEN transaction_date >= :p2 THEN tonnes ELSE 0 END)::float AS current_3m,
                SUM(CASE WHEN transaction_date >= :p1 AND transaction_date < :p2 THEN tonnes ELSE 0 END)::float AS prior_3m
            FROM fact_sales_lines
            WHERE {co_frag} {scope_frag} AND transaction_date >= :p1
            GROUP BY 1
        )
        SELECT salesperson, current_3m, prior_3m,
               ROUND(CASE WHEN prior_3m > 0 THEN (current_3m - prior_3m) / prior_3m * 100 ELSE NULL END::numeric, 1)::float AS pct_change,
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
    """), {**co_params, "p1": period1_start, "p2": period2_start}).mappings().all()

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
        "company_nos": resolved,
        "sale_scope": sale_scope,
        "reference_date": ref_date.isoformat(),
        "mtd_projection": mtd_projection,
        "product_group_trends": product_group_trends,
        "customer_lapse_risk": customer_lapse_risk,
        "products_to_push": products_to_push,
        "salesperson_trends": salesperson_trends,
    }


@router.get("/customer-history/{customer_code}")
def get_customer_history(
    customer_code: str,
    company_nos: Optional[list[str]] = Query(default=None),
    company_no: Optional[str] = Query(default=None),
    sale_scope: str = Query(default="all"),
    db: Session = Depends(get_db),
):
    resolved = company_nos or ([company_no] if company_no else None) or [settings.hansa_company_no]
    co_frag, co_params = build_company_filter(resolved)
    scope_frag = build_scope_sql(sale_scope)
    params = {**co_params, "cust_code": customer_code}

    monthly_rows = db.execute(text(f"""
        SELECT
            DATE_TRUNC('month', transaction_date)::date::text AS month,
            ROUND(SUM(tonnes)::numeric, 2)                    AS tonnes,
            COUNT(*)                                          AS txn_count
        FROM fact_sales_lines
        WHERE {co_frag}
          {scope_frag}
          AND customer_code = :cust_code
        GROUP BY DATE_TRUNC('month', transaction_date)
        ORDER BY month
        LIMIT 36
    """), params).mappings().fetchall()

    group_rows = db.execute(text(f"""
        WITH ref AS (
            SELECT MAX(transaction_date) AS max_d
            FROM fact_sales_lines
            WHERE {co_frag} {scope_frag} AND customer_code = :cust_code
        )
        SELECT
            COALESCE(item_group_code, 'UNKNOWN')  AS group_code,
            COALESCE(MAX(item_group_name), 'Unknown') AS group_name,
            ROUND(SUM(tonnes)::numeric, 2)        AS total_tonnes,
            ROUND(SUM(CASE WHEN transaction_date >= (SELECT max_d FROM ref) - INTERVAL '3 months'
                           THEN tonnes ELSE 0 END)::numeric, 2) AS t3m,
            ROUND(SUM(CASE WHEN transaction_date >= (SELECT max_d FROM ref) - INTERVAL '6 months'
                            AND transaction_date  < (SELECT max_d FROM ref) - INTERVAL '3 months'
                           THEN tonnes ELSE 0 END)::numeric, 2) AS p3m,
            MAX(transaction_date)::text           AS last_sale,
            COUNT(DISTINCT item_code)             AS items
        FROM fact_sales_lines
        WHERE {co_frag}
          {scope_frag}
          AND customer_code = :cust_code
          AND item_group_code IS NOT NULL
        GROUP BY item_group_code
        ORDER BY total_tonnes DESC
    """), params).mappings().fetchall()

    item_rows = db.execute(text(f"""
        WITH ref AS (
            SELECT MAX(transaction_date) AS max_d
            FROM fact_sales_lines
            WHERE {co_frag} {scope_frag} AND customer_code = :cust_code
        )
        SELECT
            item_code,
            COALESCE(MAX(item_name), item_code)      AS item_name,
            COALESCE(MAX(item_group_name), 'Unknown') AS group_name,
            ROUND(SUM(tonnes)::numeric, 2)           AS total_tonnes,
            MAX(transaction_date)::text              AS last_sale,
            ((SELECT max_d FROM ref) - MAX(transaction_date))::int AS days_since
        FROM fact_sales_lines
        WHERE {co_frag}
          {scope_frag}
          AND customer_code = :cust_code
          AND item_code IS NOT NULL
        GROUP BY item_code
        ORDER BY total_tonnes DESC
        LIMIT 20
    """), params).mappings().fetchall()

    summary = db.execute(text(f"""
        SELECT
            COALESCE(MAX(customer_name), :cust_code) AS customer_name,
            ROUND(SUM(tonnes)::numeric, 2)           AS total_tonnes,
            MIN(transaction_date)::text              AS first_purchase,
            MAX(transaction_date)::text              AS last_purchase,
            COUNT(DISTINCT DATE_TRUNC('month', transaction_date)) AS active_months
        FROM fact_sales_lines
        WHERE {co_frag}
          {scope_frag}
          AND customer_code = :cust_code
    """), params).mappings().fetchone()

    def _f(v): return float(v) if v is not None else 0.0

    return {
        "customer_code": customer_code,
        "customer_name": summary["customer_name"] if summary else customer_code,
        "total_tonnes": _f(summary["total_tonnes"] if summary else None),
        "first_purchase": summary["first_purchase"] if summary else None,
        "last_purchase": summary["last_purchase"] if summary else None,
        "active_months": int(summary["active_months"] or 0) if summary else 0,
        "monthly": [
            {"month": r["month"], "tonnes": _f(r["tonnes"]), "txn_count": int(r["txn_count"] or 0)}
            for r in monthly_rows
        ],
        "by_group": [
            {
                "group_code": r["group_code"],
                "group_name": r["group_name"],
                "total_tonnes": _f(r["total_tonnes"]),
                "t3m": _f(r["t3m"]),
                "p3m": _f(r["p3m"]),
                "change_pct": round((_f(r["t3m"]) - _f(r["p3m"])) / _f(r["p3m"]) * 100, 1)
                              if _f(r["p3m"]) > 0 else None,
                "last_sale": r["last_sale"],
                "items": int(r["items"] or 0),
            }
            for r in group_rows
        ],
        "top_items": [
            {
                "item_code": r["item_code"],
                "item_name": r["item_name"],
                "group_name": r["group_name"],
                "total_tonnes": _f(r["total_tonnes"]),
                "last_sale": r["last_sale"],
                "days_since": int(r["days_since"]) if r["days_since"] is not None else None,
            }
            for r in item_rows
        ],
    }


@router.get("/item-history/{item_code}")
def get_item_history(
    item_code: str,
    company_nos: Optional[list[str]] = Query(default=None),
    company_no: Optional[str] = Query(default=None),
    sale_scope: str = Query(default="all"),
    db: Session = Depends(get_db),
):
    resolved = company_nos or ([company_no] if company_no else None) or [settings.hansa_company_no]
    co_frag, co_params = build_company_filter(resolved)
    scope_frag = build_scope_sql(sale_scope)
    params = {**co_params, "item_code": item_code}

    summary = db.execute(text(f"""
        SELECT
            COALESCE(MAX(item_name), :item_code)      AS item_name,
            COALESCE(MAX(item_group_code), '')         AS group_code,
            COALESCE(MAX(item_group_name), 'Unknown')  AS group_name,
            ROUND(SUM(tonnes)::numeric, 2)             AS total_tonnes,
            MIN(transaction_date)::text                AS first_sale,
            MAX(transaction_date)::text                AS last_sale,
            COUNT(DISTINCT customer_code)              AS unique_customers
        FROM fact_sales_lines
        WHERE {co_frag} {scope_frag} AND item_code = :item_code
    """), params).mappings().fetchone()

    def _f(v): return float(v) if v is not None else 0.0

    if not summary or not _f(summary["total_tonnes"]):
        return {
            "item_code": item_code, "item_name": item_code,
            "group_code": "", "group_name": "", "total_tonnes": 0,
            "first_sale": None, "last_sale": None, "unique_customers": 0,
            "monthly": [], "top_customers": [],
        }

    monthly_rows = db.execute(text(f"""
        WITH ref AS (
            SELECT MAX(transaction_date) AS max_d
            FROM fact_sales_lines
            WHERE {co_frag} {scope_frag} AND item_code = :item_code
        )
        SELECT
            DATE_TRUNC('month', transaction_date)::date::text AS month,
            ROUND(SUM(tonnes)::numeric, 2) AS tonnes,
            COUNT(*) AS txn_count
        FROM fact_sales_lines
        CROSS JOIN ref
        WHERE {co_frag} {scope_frag} AND item_code = :item_code
          AND transaction_date >= (ref.max_d - INTERVAL '24 months')
        GROUP BY DATE_TRUNC('month', transaction_date)
        ORDER BY month
    """), params).mappings().fetchall()

    customer_rows = db.execute(text(f"""
        WITH ref AS (
            SELECT MAX(transaction_date) AS max_d
            FROM fact_sales_lines
            WHERE {co_frag} {scope_frag} AND item_code = :item_code
        )
        SELECT
            customer_code,
            COALESCE(MAX(customer_name), customer_code) AS customer_name,
            ROUND(SUM(tonnes)::numeric, 2)              AS total_tonnes,
            ROUND(SUM(CASE WHEN transaction_date >= ref.max_d - INTERVAL '3 months'
                           THEN tonnes ELSE 0 END)::numeric, 2) AS t3m,
            MAX(transaction_date)::text                 AS last_purchase,
            (ref.max_d - MAX(transaction_date))::int    AS days_since
        FROM fact_sales_lines
        CROSS JOIN ref
        WHERE {co_frag} {scope_frag} AND item_code = :item_code
        GROUP BY customer_code, ref.max_d
        ORDER BY total_tonnes DESC
        LIMIT 15
    """), params).mappings().fetchall()

    return {
        "item_code": item_code,
        "item_name": summary["item_name"],
        "group_code": summary["group_code"] or "",
        "group_name": summary["group_name"],
        "total_tonnes": _f(summary["total_tonnes"]),
        "first_sale": summary["first_sale"],
        "last_sale": summary["last_sale"],
        "unique_customers": int(summary["unique_customers"] or 0),
        "monthly": [
            {"month": r["month"], "tonnes": _f(r["tonnes"]), "txn_count": int(r["txn_count"] or 0)}
            for r in monthly_rows
        ],
        "top_customers": [
            {
                "customer_code": r["customer_code"],
                "customer_name": r["customer_name"],
                "total_tonnes": _f(r["total_tonnes"]),
                "t3m": _f(r["t3m"]),
                "last_purchase": r["last_purchase"],
                "days_since": int(r["days_since"]) if r["days_since"] is not None else None,
            }
            for r in customer_rows
        ],
    }


@router.get("/daily-sales")
def get_daily_sales(
    date_from: str = Query(...),
    date_to: str = Query(...),
    company_nos: Optional[list[str]] = Query(default=None),
    sale_scope: str = Query(default="all"),
    db: Session = Depends(get_db),
):
    """Return daily sales totals (with cumulative) for a given date range."""
    try:
        d_from = date.fromisoformat(date_from)
        d_to = date.fromisoformat(date_to)
    except ValueError:
        return []

    resolved = company_nos or [settings.hansa_company_no]
    co_frag, co_params = build_company_filter(resolved)
    scope_frag = build_scope_sql(sale_scope)

    rows = db.execute(text(f"""
        SELECT
            transaction_date::text AS date,
            ROUND(SUM(tonnes)::numeric, 2) AS tonnes
        FROM fact_sales_lines
        WHERE {co_frag}
          {scope_frag}
          AND transaction_date >= :date_from
          AND transaction_date <= :date_to
        GROUP BY transaction_date
        ORDER BY transaction_date
    """), {**co_params, "date_from": d_from, "date_to": d_to}).mappings().fetchall()

    result = []
    cumulative = 0.0
    for r in rows:
        t = float(r["tonnes"] or 0)
        cumulative += t
        result.append({
            "date": r["date"],
            "tonnes": round(t, 2),
            "cumulative_tonnes": round(cumulative, 2),
        })

    return result
