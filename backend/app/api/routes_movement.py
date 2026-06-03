"""
Movement analytics routes — product groups, items, customers.
Supports company_nos (multi-select) and sale_scope (all/external/internal).
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.filters import build_company_filter, build_scope_sql
from app.db.database import get_db

router = APIRouter(prefix="/api/movement", tags=["movement"])


def _resolve(company_nos, company_no):
    return company_nos or ([company_no] if company_no else ["3"])


@router.get("/product-groups")
def product_group_movement(
    company_nos: Optional[list[str]] = Query(default=None),
    company_no: str = Query(default="3"),
    sale_scope: str = Query(default="all"),
    db: Session = Depends(get_db),
):
    resolved = _resolve(company_nos, company_no)
    co_frag, co_params = build_company_filter(resolved)
    scope_frag = build_scope_sql(sale_scope)

    rows = db.execute(text(f"""
        WITH ref AS (
            SELECT MAX(transaction_date) AS max_d
            FROM fact_sales_lines WHERE {co_frag} {scope_frag}
        ),
        base AS (
            SELECT
                COALESCE(item_group_code, 'UNKNOWN') AS group_code,
                COALESCE(MAX(item_group_name), 'Unknown') AS group_name,
                ROUND(SUM(tonnes)::numeric, 1) AS total_tonnes,
                ROUND(SUM(CASE WHEN transaction_date >= (SELECT max_d FROM ref) - INTERVAL '3 months'
                                THEN tonnes ELSE 0 END)::numeric, 1) AS t3m,
                ROUND(SUM(CASE WHEN transaction_date >= (SELECT max_d FROM ref) - INTERVAL '6 months'
                               AND transaction_date < (SELECT max_d FROM ref) - INTERVAL '3 months'
                               THEN tonnes ELSE 0 END)::numeric, 1) AS p3m,
                ROUND(SUM(CASE WHEN DATE_TRUNC('year', transaction_date) = DATE_TRUNC('year', (SELECT max_d FROM ref))
                               THEN tonnes ELSE 0 END)::numeric, 1) AS ytd,
                ROUND(SUM(CASE WHEN DATE_TRUNC('year', transaction_date) = DATE_TRUNC('year', (SELECT max_d FROM ref)) - INTERVAL '1 year'
                               THEN tonnes ELSE 0 END)::numeric, 1) AS lytd,
                MAX(transaction_date)::text AS last_sale,
                COUNT(DISTINCT customer_code) AS unique_customers,
                COUNT(DISTINCT item_code) AS unique_items
            FROM fact_sales_lines
            WHERE {co_frag}
              {scope_frag}
              AND item_group_code IS NOT NULL
            GROUP BY item_group_code
        )
        SELECT *,
            CASE
                WHEN t3m = 0 THEN 'Dead'
                WHEN p3m = 0 THEN 'New'
                WHEN (t3m - p3m) / NULLIF(p3m, 0) > 0.15  THEN 'Growing'
                WHEN (t3m - p3m) / NULLIF(p3m, 0) < -0.15 THEN 'Declining'
                ELSE 'Stable'
            END AS status,
            CASE WHEN p3m > 0
                 THEN ROUND(((t3m - p3m) / p3m * 100)::numeric, 1)
                 ELSE NULL END AS change_pct,
            CASE WHEN lytd > 0
                 THEN ROUND(((ytd - lytd) / lytd * 100)::numeric, 1)
                 ELSE NULL END AS yoy_pct
        FROM base
        ORDER BY total_tonnes DESC NULLS LAST
    """), co_params).mappings().fetchall()
    return [dict(r) for r in rows]


@router.get("/product-groups/{group_code}/monthly")
def product_group_monthly(
    group_code: str,
    company_nos: Optional[list[str]] = Query(default=None),
    company_no: str = Query(default="3"),
    sale_scope: str = Query(default="all"),
    db: Session = Depends(get_db),
):
    resolved = _resolve(company_nos, company_no)
    co_frag, co_params = build_company_filter(resolved)
    scope_frag = build_scope_sql(sale_scope)

    rows = db.execute(text(f"""
        SELECT
            DATE_TRUNC('month', transaction_date)::date::text AS month,
            ROUND(SUM(tonnes)::numeric, 1) AS tonnes,
            COUNT(DISTINCT customer_code) AS customers,
            COUNT(DISTINCT item_code) AS items
        FROM fact_sales_lines
        WHERE {co_frag}
          {scope_frag}
          AND item_group_code = :group_code
        GROUP BY DATE_TRUNC('month', transaction_date)
        ORDER BY month
    """), {**co_params, "group_code": group_code}).mappings().fetchall()
    return [dict(r) for r in rows]


@router.get("/items")
def slow_moving_items(
    company_nos: Optional[list[str]] = Query(default=None),
    company_no: str = Query(default="3"),
    sale_scope: str = Query(default="all"),
    group_code: Optional[str] = Query(default=None, alias="group_code"),
    db: Session = Depends(get_db),
):
    resolved = _resolve(company_nos, company_no)
    co_frag, co_params = build_company_filter(resolved)
    scope_frag = build_scope_sql(sale_scope)
    group_filter = "AND item_group_code = :group_code" if group_code else ""

    rows = db.execute(text(f"""
        WITH ref AS (
            SELECT MAX(transaction_date) AS max_d
            FROM fact_sales_lines WHERE {co_frag} {scope_frag}
        ),
        base AS (
            SELECT
                item_code,
                COALESCE(MAX(item_name), item_code) AS item_name,
                COALESCE(MAX(item_group_code), 'UNKNOWN') AS group_code,
                COALESCE(MAX(item_group_name), 'Unknown') AS group_name,
                ROUND(SUM(tonnes)::numeric, 1) AS total_tonnes,
                ROUND(SUM(CASE WHEN transaction_date >= (SELECT max_d FROM ref) - INTERVAL '3 months'
                               THEN tonnes ELSE 0 END)::numeric, 1) AS t3m,
                ROUND(SUM(CASE WHEN DATE_TRUNC('year', transaction_date) = DATE_TRUNC('year', (SELECT max_d FROM ref))
                               THEN tonnes ELSE 0 END)::numeric, 1) AS ytd,
                MAX(transaction_date)::text AS last_sale,
                ((SELECT max_d FROM ref) - MAX(transaction_date))::int AS days_since,
                COUNT(DISTINCT customer_code) AS customers
            FROM fact_sales_lines
            WHERE {co_frag}
              {scope_frag}
              AND item_code IS NOT NULL
              {group_filter}
            GROUP BY item_code
            HAVING ((SELECT max_d FROM ref) - MAX(transaction_date)) > 44
        )
        SELECT *,
            CASE
                WHEN days_since > 180 THEN 'Dead Stock'
                WHEN days_since > 90  THEN 'Very Slow'
                ELSE 'Slow Mover'
            END AS status
        FROM base
        ORDER BY days_since DESC, total_tonnes DESC
        LIMIT 400
    """), {**co_params, "group_code": group_code}).mappings().fetchall()
    return [dict(r) for r in rows]


@router.get("/customers")
def customer_movement(
    company_nos: Optional[list[str]] = Query(default=None),
    company_no: str = Query(default="3"),
    sale_scope: str = Query(default="all"),
    db: Session = Depends(get_db),
):
    resolved = _resolve(company_nos, company_no)
    co_frag, co_params = build_company_filter(resolved)
    scope_frag = build_scope_sql(sale_scope)

    rows = db.execute(text(f"""
        WITH ref AS (
            SELECT MAX(transaction_date) AS max_d
            FROM fact_sales_lines WHERE {co_frag} {scope_frag}
        ),
        cust AS (
            SELECT
                customer_code,
                COALESCE(MAX(customer_name), customer_code) AS customer_name,
                ROUND(SUM(tonnes)::numeric, 1) AS total_tonnes,
                ROUND(SUM(CASE WHEN transaction_date >= (SELECT max_d FROM ref) - INTERVAL '3 months'
                               THEN tonnes ELSE 0 END)::numeric, 1) AS t3m,
                ROUND(SUM(CASE WHEN transaction_date >= (SELECT max_d FROM ref) - INTERVAL '6 months'
                               AND transaction_date < (SELECT max_d FROM ref) - INTERVAL '3 months'
                               THEN tonnes ELSE 0 END)::numeric, 1) AS p3m,
                MAX(transaction_date)::text AS last_purchase,
                ((SELECT max_d FROM ref) - MAX(transaction_date))::int AS days_since,
                COUNT(DISTINCT item_group_code) AS product_groups,
                MAX(salesperson) AS last_rep,
                (SELECT item_group_code FROM fact_sales_lines f2
                 WHERE f2.customer_code = fact_sales_lines.customer_code
                   AND f2.company_no = fact_sales_lines.company_no
                 GROUP BY item_group_code ORDER BY SUM(tonnes) DESC LIMIT 1
                ) AS top_group
            FROM fact_sales_lines
            WHERE {co_frag}
              {scope_frag}
              AND customer_code IS NOT NULL
            GROUP BY customer_code
        )
        SELECT *,
            CASE
                WHEN days_since > 60 AND t3m = 0 THEN 'Stopped'
                WHEN days_since > 30 AND t3m = 0 THEN 'At Risk'
                WHEN p3m > 0 AND (t3m - p3m) / NULLIF(p3m, 0) < -0.25 THEN 'Declining'
                WHEN days_since <= 30 THEN 'Active'
                ELSE 'Irregular'
            END AS status,
            CASE WHEN p3m > 0
                 THEN ROUND(((t3m - p3m) / p3m * 100)::numeric, 1)
                 ELSE NULL END AS change_pct
        FROM cust
        ORDER BY
            CASE
                WHEN days_since > 60 AND t3m = 0 THEN 1
                WHEN days_since > 30 AND t3m = 0 THEN 2
                WHEN p3m > 0 AND (t3m - p3m) / NULLIF(p3m, 0) < -0.25 THEN 3
                ELSE 4
            END,
            days_since DESC
    """), co_params).mappings().fetchall()
    return [dict(r) for r in rows]


@router.get("/summary")
def movement_summary(
    company_nos: Optional[list[str]] = Query(default=None),
    company_no: str = Query(default="3"),
    sale_scope: str = Query(default="all"),
    db: Session = Depends(get_db),
):
    resolved = _resolve(company_nos, company_no)
    co_frag, co_params = build_company_filter(resolved)
    scope_frag = build_scope_sql(sale_scope)

    row = db.execute(text(f"""
        WITH ref AS (
            SELECT MAX(transaction_date) AS max_d
            FROM fact_sales_lines WHERE {co_frag} {scope_frag}
        ),
        grp AS (
            SELECT item_group_code,
                SUM(CASE WHEN transaction_date >= (SELECT max_d FROM ref) - INTERVAL '3 months'
                         THEN tonnes ELSE 0 END) AS t3m,
                SUM(CASE WHEN transaction_date >= (SELECT max_d FROM ref) - INTERVAL '6 months'
                         AND transaction_date < (SELECT max_d FROM ref) - INTERVAL '3 months'
                         THEN tonnes ELSE 0 END) AS p3m
            FROM fact_sales_lines WHERE {co_frag} {scope_frag} AND item_group_code IS NOT NULL
            GROUP BY item_group_code
        ),
        cust AS (
            SELECT customer_code,
                ((SELECT max_d FROM ref) - MAX(transaction_date))::int AS days_since,
                SUM(CASE WHEN transaction_date >= (SELECT max_d FROM ref) - INTERVAL '3 months'
                         THEN tonnes ELSE 0 END) AS t3m
            FROM fact_sales_lines WHERE {co_frag} {scope_frag} AND customer_code IS NOT NULL
            GROUP BY customer_code
        ),
        itm AS (
            SELECT item_code,
                ((SELECT max_d FROM ref) - MAX(transaction_date))::int AS days_since
            FROM fact_sales_lines WHERE {co_frag} {scope_frag} AND item_code IS NOT NULL
            GROUP BY item_code
        )
        SELECT
            (SELECT max_d FROM ref)::text AS data_as_of,
            (SELECT COUNT(*) FROM grp WHERE p3m > 0 AND (t3m - p3m) / NULLIF(p3m,0) > 0.15)  AS growing_groups,
            (SELECT COUNT(*) FROM grp WHERE t3m = 0) AS dead_groups,
            (SELECT COUNT(*) FROM grp WHERE p3m > 0 AND (t3m - p3m) / NULLIF(p3m,0) < -0.15) AS declining_groups,
            (SELECT COUNT(*) FROM cust WHERE t3m = 0 AND days_since > 60) AS stopped_customers,
            (SELECT COUNT(*) FROM cust WHERE t3m = 0 AND days_since BETWEEN 30 AND 60) AS at_risk_customers,
            (SELECT COUNT(*) FROM itm WHERE days_since > 90) AS slow_items,
            (SELECT COUNT(*) FROM itm WHERE days_since > 180) AS dead_items
    """), co_params).mappings().fetchone()
    return dict(row) if row else {}
