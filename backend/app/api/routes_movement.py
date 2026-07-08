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

router = APIRouter(prefix="/api/movement", tags=["Movement Analytics"])


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


@router.get("/slow-items")
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

    co_frag_f2, _ = build_company_filter(resolved, col="f2.company_no")

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
                   AND {co_frag_f2}
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


@router.get("/product-groups/{group_code}/items")
def product_group_items(
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
        WITH ref AS (
            SELECT MAX(transaction_date) AS max_d
            FROM fact_sales_lines WHERE {co_frag} {scope_frag}
        ),
        base AS (
            SELECT
                item_code,
                COALESCE(MAX(item_name), item_code) AS item_name,
                ROUND(SUM(tonnes)::numeric, 1) AS total_tonnes,
                ROUND(SUM(CASE WHEN transaction_date >= (SELECT max_d FROM ref) - INTERVAL '3 months'
                               THEN tonnes ELSE 0 END)::numeric, 1) AS t3m,
                ROUND(SUM(CASE WHEN transaction_date >= (SELECT max_d FROM ref) - INTERVAL '6 months'
                               AND transaction_date < (SELECT max_d FROM ref) - INTERVAL '3 months'
                               THEN tonnes ELSE 0 END)::numeric, 1) AS p3m,
                ROUND(SUM(quantity)::numeric, 0) AS qty_bought,
                MAX(transaction_date)::text AS last_sale,
                ((SELECT max_d FROM ref) - MAX(transaction_date))::int AS days_since,
                COUNT(DISTINCT customer_code) AS customers
            FROM fact_sales_lines
            WHERE {co_frag}
              {scope_frag}
              AND item_group_code = :group_code
              AND item_code IS NOT NULL
            GROUP BY item_code
        )
        SELECT base.*,
            COALESCE(stock.qty_on_hand, 0) AS qty_on_hand,
            CASE WHEN p3m > 0
                 THEN ROUND(((t3m - p3m) / p3m * 100)::numeric, 1)
                 ELSE NULL END AS change_pct
        FROM base
        LEFT JOIN (
            SELECT art_code, ROUND(SUM(instock)::numeric, 0) AS qty_on_hand
            FROM item_stock_status
            WHERE {co_frag}
            GROUP BY art_code
        ) stock ON stock.art_code = base.item_code
        ORDER BY total_tonnes DESC
        LIMIT 200
    """), {**co_params, "group_code": group_code}).mappings().fetchall()
    return [dict(r) for r in rows]


@router.get("/customers/{customer_code}/groups")
def customer_groups(
    customer_code: str,
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
                MAX(transaction_date)::text AS last_sale,
                COUNT(DISTINCT item_code) AS items
            FROM fact_sales_lines
            WHERE {co_frag}
              {scope_frag}
              AND customer_code = :customer_code
              AND item_group_code IS NOT NULL
            GROUP BY item_group_code
        )
        SELECT *,
            CASE WHEN p3m > 0
                 THEN ROUND(((t3m - p3m) / p3m * 100)::numeric, 1)
                 ELSE NULL END AS change_pct
        FROM base
        ORDER BY total_tonnes DESC
    """), {**co_params, "customer_code": customer_code}).mappings().fetchall()
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
            (SELECT COUNT(*) FROM cust WHERE t3m > 0) AS active_customers,
            (SELECT COUNT(*) FROM cust WHERE t3m = 0 AND days_since > 60) AS stopped_customers,
            (SELECT COUNT(*) FROM cust WHERE t3m = 0 AND days_since BETWEEN 30 AND 60) AS at_risk_customers,
            (SELECT COUNT(*) FROM itm WHERE days_since > 90) AS slow_items,
            (SELECT COUNT(*) FROM itm WHERE days_since > 180) AS dead_items
    """), co_params).mappings().fetchone()
    return dict(row) if row else {}


@router.get("/customers/heatmap")
def customer_heatmap(
    company_nos: Optional[list[str]] = Query(default=None),
    company_no: str = Query(default="3"),
    sale_scope: str = Query(default="all"),
    limit: int = Query(default=15, ge=5, le=30),
    db: Session = Depends(get_db),
):
    """Return per-customer per-month tonnes for the top N customers over the last 12 months."""
    resolved = _resolve(company_nos, company_no)
    co_frag, co_params = build_company_filter(resolved)
    scope_frag = build_scope_sql(sale_scope)
    limit_safe = min(max(int(limit), 5), 30)

    rows = db.execute(text(f"""
        WITH months AS (
            SELECT generate_series(
                DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months',
                DATE_TRUNC('month', CURRENT_DATE),
                INTERVAL '1 month'
            )::date AS month_start
        ),
        top_customers AS (
            SELECT
                customer_code,
                MAX(customer_name) AS customer_name,
                ROUND(SUM(tonnes)::numeric, 2) AS total_tonnes
            FROM fact_sales_lines
            WHERE {co_frag}
              {scope_frag}
              AND customer_code IS NOT NULL
              AND transaction_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
            GROUP BY customer_code
            ORDER BY total_tonnes DESC
            LIMIT {limit_safe}
        ),
        monthly_agg AS (
            SELECT
                f.customer_code,
                DATE_TRUNC('month', f.transaction_date)::date AS month_start,
                ROUND(SUM(f.tonnes)::numeric, 2) AS tonnes
            FROM fact_sales_lines f
            INNER JOIN top_customers tc ON f.customer_code = tc.customer_code
            WHERE {co_frag.replace("company_no", "f.company_no", 1)}
              AND f.transaction_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
            GROUP BY f.customer_code, DATE_TRUNC('month', f.transaction_date)
        )
        SELECT
            tc.customer_code,
            tc.customer_name,
            tc.total_tonnes,
            m.month_start,
            COALESCE(ma.tonnes, 0) AS month_tonnes
        FROM top_customers tc
        CROSS JOIN months m
        LEFT JOIN monthly_agg ma
            ON ma.customer_code = tc.customer_code
           AND ma.month_start = m.month_start
        ORDER BY tc.total_tonnes DESC, m.month_start
    """), co_params).mappings().all()

    from collections import OrderedDict
    import datetime as _dt

    customers: dict = OrderedDict()
    for row in rows:
        code = row["customer_code"]
        if code not in customers:
            customers[code] = {
                "customer_code": code,
                "customer_name": row["customer_name"],
                "total_tonnes": float(row["total_tonnes"]),
                "months": [],
            }
        ms = row["month_start"]
        if hasattr(ms, "strftime"):
            d = ms
        else:
            d = _dt.datetime.strptime(str(ms), "%Y-%m-%d").date()
        customers[code]["months"].append({
            "month": d.strftime("%b"),
            "year": d.year,
            "tonnes": float(row["month_tonnes"]),
        })

    return list(customers.values())


@router.get("/customers/reorder-windows")
def missed_reorder_windows(
    company_nos: Optional[list[str]] = Query(default=None),
    company_no: str = Query(default="3"),
    sale_scope: str = Query(default="all"),
    db: Session = Depends(get_db),
):
    """Customers overdue for a reorder based on historical purchase cadence."""
    resolved = _resolve(company_nos, company_no)
    co_frag, co_params = build_company_filter(resolved)
    scope_frag = build_scope_sql(sale_scope)

    rows = db.execute(text(f"""
        WITH monthly_activity AS (
            SELECT
                customer_code,
                MAX(customer_name)                        AS customer_name,
                DATE_TRUNC('month', transaction_date)::date AS month_start,
                SUM(tonnes)                               AS month_tonnes
            FROM fact_sales_lines
            WHERE {co_frag}
              {scope_frag}
              AND customer_code IS NOT NULL
              AND transaction_date >= CURRENT_DATE - INTERVAL '18 months'
            GROUP BY customer_code, DATE_TRUNC('month', transaction_date)
        ),
        with_gaps AS (
            SELECT
                customer_code,
                customer_name,
                month_start,
                month_tonnes,
                EXTRACT(DAY FROM (
                    month_start::timestamp
                    - LAG(month_start::timestamp) OVER (PARTITION BY customer_code ORDER BY month_start)
                ))                                   AS gap_days
            FROM monthly_activity
        ),
        customer_stats AS (
            SELECT
                customer_code,
                MAX(customer_name)                       AS customer_name,
                COUNT(*)                                 AS active_months,
                MAX(month_start)                         AS last_active_month,
                ROUND(AVG(month_tonnes)::numeric, 2)     AS avg_monthly_tonnes,
                ROUND(
                    AVG(gap_days) FILTER (WHERE gap_days IS NOT NULL)::numeric
                )                                        AS avg_gap_days
            FROM with_gaps
            GROUP BY customer_code
        )
        SELECT
            cs.customer_code,
            cs.customer_name,
            cs.last_active_month::text                   AS last_active_month,
            cs.avg_monthly_tonnes                        AS usual_volume,
            cs.active_months,
            COALESCE(cs.avg_gap_days, 30)                AS avg_reorder_days,
            (cs.last_active_month
                + (COALESCE(cs.avg_gap_days, 30)::int * INTERVAL '1 day')
            )::date::text                                AS expected_reorder_date,
            GREATEST(
                (CURRENT_DATE - (
                    cs.last_active_month
                    + (COALESCE(cs.avg_gap_days, 30)::int * INTERVAL '1 day')
                )::date)::int,
                0
            )                                            AS days_overdue
        FROM customer_stats cs
        WHERE
            cs.active_months >= 3
            AND (
                cs.last_active_month
                + (COALESCE(cs.avg_gap_days, 30)::int * INTERVAL '1 day')
            )::date < CURRENT_DATE
            AND cs.last_active_month >= (CURRENT_DATE - INTERVAL '5 months')::date
        ORDER BY days_overdue DESC, cs.avg_monthly_tonnes DESC
        LIMIT 25
    """), co_params).mappings().all()

    result = []
    for row in rows:
        days_overdue = int(row["days_overdue"] or 0)
        priority = "high" if days_overdue > 6 else "medium" if days_overdue >= 3 else "low"
        result.append({
            "customer_code": row["customer_code"],
            "customer_name": row["customer_name"],
            "last_active_month": row["last_active_month"],
            "usual_volume": float(row["usual_volume"] or 0),
            "active_months": int(row["active_months"] or 0),
            "avg_reorder_days": int(row["avg_reorder_days"] or 30),
            "expected_reorder_date": row["expected_reorder_date"],
            "days_overdue": days_overdue,
            "priority": priority,
        })
    return result
