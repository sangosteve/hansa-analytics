"""
Movement analytics routes — product groups, items, customers.
All time windows are computed relative to the data's max transaction date,
not CURRENT_DATE, because the data lags the current date.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.database import get_db

router = APIRouter(prefix="/api/movement", tags=["movement"])

_REF_SQL = """
    SELECT MAX(transaction_date) as max_date
    FROM fact_sales_lines
    WHERE company_no = :company_no
"""


@router.get("/product-groups")
def product_group_movement(
    company_no: str = "3",
    db: Session = Depends(get_db),
):
    """
    Per-product-group movement summary:
    - recent 3m vs prior 3m tonnes
    - YTD vs prior-year tonnes
    - Status: Growing / Stable / Declining / Dead / New
    Time windows relative to the data's max transaction date.
    """
    rows = db.execute(text("""
        WITH ref AS (
            SELECT MAX(transaction_date) AS max_d
            FROM fact_sales_lines WHERE company_no = :company_no
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
            WHERE company_no = :company_no
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
    """), {"company_no": company_no}).mappings().fetchall()

    return [dict(r) for r in rows]


@router.get("/product-groups/{group_code}/monthly")
def product_group_monthly(
    group_code: str,
    company_no: str = "3",
    db: Session = Depends(get_db),
):
    """Monthly breakdown for a specific product group (for sparklines / drilldown)."""
    rows = db.execute(text("""
        SELECT
            DATE_TRUNC('month', transaction_date)::date::text AS month,
            ROUND(SUM(tonnes)::numeric, 1) AS tonnes,
            COUNT(DISTINCT customer_code) AS customers,
            COUNT(DISTINCT item_code) AS items
        FROM fact_sales_lines
        WHERE company_no = :company_no
          AND item_group_code = :group_code
        GROUP BY DATE_TRUNC('month', transaction_date)
        ORDER BY month
    """), {"company_no": company_no, "group_code": group_code}).mappings().fetchall()

    return [dict(r) for r in rows]


@router.get("/items")
def slow_moving_items(
    company_no: str = "3",
    group_code: str = Query(default=None, alias="group_code"),
    db: Session = Depends(get_db),
):
    """
    Items classified by recency relative to the data's max date.
    Dead Stock  > 180 days from max_date
    Very Slow   > 90 days from max_date
    Slow Mover  > 45 days from max_date
    """
    group_filter = "AND item_group_code = :group_code" if group_code else ""
    rows = db.execute(text(f"""
        WITH ref AS (
            SELECT MAX(transaction_date) AS max_d
            FROM fact_sales_lines WHERE company_no = :company_no
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
            WHERE company_no = :company_no
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
    """), {"company_no": company_no, "group_code": group_code}).mappings().fetchall()

    return [dict(r) for r in rows]


@router.get("/customers")
def customer_movement(
    company_no: str = "3",
    db: Session = Depends(get_db),
):
    """
    Customer movement status relative to data's max date.
    Stopped    no purchase in last 60 days (from max_date)
    At Risk    no purchase in last 30–60 days
    Declining  bought but volume dropped > 25%
    Active     bought within last 30 days
    """
    rows = db.execute(text("""
        WITH ref AS (
            SELECT MAX(transaction_date) AS max_d
            FROM fact_sales_lines WHERE company_no = :company_no
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
                   AND f2.company_no = :company_no
                 GROUP BY item_group_code ORDER BY SUM(tonnes) DESC LIMIT 1
                ) AS top_group
            FROM fact_sales_lines
            WHERE company_no = :company_no
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
    """), {"company_no": company_no}).mappings().fetchall()

    return [dict(r) for r in rows]


@router.get("/summary")
def movement_summary(
    company_no: str = "3",
    db: Session = Depends(get_db),
):
    """Headline KPI counts for the movement dashboard."""
    row = db.execute(text("""
        WITH ref AS (
            SELECT MAX(transaction_date) AS max_d
            FROM fact_sales_lines WHERE company_no = :company_no
        ),
        grp AS (
            SELECT item_group_code,
                SUM(CASE WHEN transaction_date >= (SELECT max_d FROM ref) - INTERVAL '3 months'
                         THEN tonnes ELSE 0 END) AS t3m,
                SUM(CASE WHEN transaction_date >= (SELECT max_d FROM ref) - INTERVAL '6 months'
                         AND transaction_date < (SELECT max_d FROM ref) - INTERVAL '3 months'
                         THEN tonnes ELSE 0 END) AS p3m
            FROM fact_sales_lines WHERE company_no = :company_no AND item_group_code IS NOT NULL
            GROUP BY item_group_code
        ),
        cust AS (
            SELECT customer_code,
                ((SELECT max_d FROM ref) - MAX(transaction_date))::int AS days_since,
                SUM(CASE WHEN transaction_date >= (SELECT max_d FROM ref) - INTERVAL '3 months'
                         THEN tonnes ELSE 0 END) AS t3m
            FROM fact_sales_lines WHERE company_no = :company_no AND customer_code IS NOT NULL
            GROUP BY customer_code
        ),
        itm AS (
            SELECT item_code,
                ((SELECT max_d FROM ref) - MAX(transaction_date))::int AS days_since
            FROM fact_sales_lines WHERE company_no = :company_no AND item_code IS NOT NULL
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
    """), {"company_no": company_no}).mappings().fetchone()

    return dict(row) if row else {}
