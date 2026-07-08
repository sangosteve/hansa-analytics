"""
Microsoft 365 Copilot connector — safe, read-only, report-focused endpoints.

All /api/copilot/* routes require:
    Authorization: Bearer <COPILOT_API_TOKEN>

Returns HTTP 401 {"error": "Unauthorized"} when the token is missing or invalid.
Returns HTTP 400 {"error": "..."} when request parameters are invalid.
Never exposes stack traces, raw SQL, or internal error details.
"""

import calendar
import logging
import re
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.config import settings
from app.core.filters import build_company_filter, build_scope_sql
from app.db.database import get_db

# Re-use existing route handler functions directly to avoid duplicating logic.
from app.api.routes_sales_summary import get_sales_summary
from app.api.routes_analytics import get_predictive_insights, get_daily_sales
from app.api.routes_customer_movement import get_customer_movement
from app.api.routes_movement import product_group_movement, customer_movement
from app.api.routes_stock import get_stock_summary
from app.api.routes_targets import list_targets
from app.api.routes_refresh import get_freshness

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/copilot", tags=["Copilot Reports"])

_MONTH_RE = re.compile(r"^\d{4}-(?:0[1-9]|1[0-2])$")

_COPILOT_GUIDANCE = {
    "suggested_report_sections": [
        "Executive Summary",
        "Sales Revenue Performance",
        "Tonnage Performance",
        "Target vs Actual",
        "Daily Sales Trend",
        "Top Customers",
        "Top Products",
        "Product Group Performance",
        "Customer Movement",
        "Risks and Observations",
        "Recommendations",
        "Conclusion",
    ],
    "recommended_charts": [
        "Line chart for daily sales trend",
        "Bar chart for target vs actual",
        "Bar chart for top customers",
        "Bar chart for top products",
        "Bar or pie chart for sales by product group",
    ],
    "important_instruction": (
        "Use only the data returned by this endpoint. Do not invent figures."
    ),
}


def _verify_token(authorization: Optional[str]) -> bool:
    """Return True if the Authorization header carries the correct bearer token."""
    expected = settings.copilot_api_token
    if not expected:
        return False
    if not authorization:
        return False
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return False
    # Constant-time comparison to prevent timing attacks
    import hmac
    return hmac.compare_digest(token, expected)


def _f(v) -> Optional[float]:
    return float(v) if v is not None else None


def _fi(v) -> Optional[int]:
    return int(v) if v is not None else None


@router.get(
    "/reports/sales-performance",
    summary="Get monthly sales performance report data",
    description=(
        "Returns trusted dashboard analytics data for Microsoft 365 Copilot to generate "
        "a professional monthly sales performance report. "
        "Requires a valid bearer token. All figures are in tonnes (monetary data not available)."
    ),
    response_description="Structured sales performance report",
    responses={
        200: {"description": "Report data returned successfully"},
        400: {"description": "Invalid month format", "content": {"application/json": {"example": {"error": "Invalid month format. Use YYYY-MM, for example 2026-06."}}}},
        401: {"description": "Unauthorized", "content": {"application/json": {"example": {"error": "Unauthorized"}}}},
    },
)
def get_sales_performance_report(
    month: str,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    # ── Auth ──────────────────────────────────────────────────────────────────
    if not _verify_token(authorization):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    # ── Validate month parameter ──────────────────────────────────────────────
    if not _MONTH_RE.match(month):
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid month format. Use YYYY-MM, for example 2026-06."},
        )

    year = int(month[:4])
    month_no = int(month[5:])
    days_in_month = calendar.monthrange(year, month_no)[1]
    date_from = date(year, month_no, 1)
    date_to = date(year, month_no, days_in_month)
    month_label = date_from.strftime("%B %Y")

    # Default scope: all active companies, all customers
    company_nos = ["all"]
    sale_scope = "all"
    co_frag, co_params = build_company_filter(company_nos)
    scope_frag = build_scope_sql(sale_scope)
    base_params = {**co_params, "date_from": date_from, "date_to": date_to}

    warnings: list[str] = []

    # ── Executive summary metrics ─────────────────────────────────────────────
    try:
        exec_row = db.execute(text(f"""
            SELECT
                SUM(tonnes)::float                    AS total_tonnage,
                COUNT(DISTINCT source_no)::int        AS invoice_count,
                COUNT(DISTINCT customer_code)::int    AS customer_count
            FROM fact_sales_lines
            WHERE {co_frag} {scope_frag}
              AND transaction_date >= :date_from
              AND transaction_date <= :date_to
        """), base_params).mappings().fetchone()

        total_tonnage = float(exec_row["total_tonnage"] or 0) if exec_row else 0.0
        invoice_count = int(exec_row["invoice_count"] or 0) if exec_row else 0
        customer_count = int(exec_row["customer_count"] or 0) if exec_row else 0
    except Exception:
        logger.exception("Executive summary query failed")
        total_tonnage, invoice_count, customer_count = 0.0, 0, 0
        warnings.append("Executive summary metrics unavailable")

    avg_daily_tonnage = round(total_tonnage / days_in_month, 2) if total_tonnage else 0.0

    # ── Prior month (month-on-month comparison) ───────────────────────────────
    try:
        if month_no == 1:
            prior_year, prior_month = year - 1, 12
        else:
            prior_year, prior_month = year, month_no - 1
        prior_days = calendar.monthrange(prior_year, prior_month)[1]
        prior_params = {
            **co_params,
            "date_from": date(prior_year, prior_month, 1),
            "date_to": date(prior_year, prior_month, prior_days),
        }
        prior_row = db.execute(text(f"""
            SELECT SUM(tonnes)::float AS total_tonnage
            FROM fact_sales_lines
            WHERE {co_frag} {scope_frag}
              AND transaction_date >= :date_from
              AND transaction_date <= :date_to
        """), prior_params).mappings().fetchone()
        prior_tonnage = float(prior_row["total_tonnage"] or 0) if prior_row else 0.0
        mom_change = round((total_tonnage - prior_tonnage) / prior_tonnage * 100, 1) if prior_tonnage else None
    except Exception:
        logger.exception("Prior-month comparison query failed")
        prior_tonnage = 0.0
        mom_change = None
        warnings.append("Month-on-month comparison unavailable")

    # ── Sales target for the month ────────────────────────────────────────────
    target_tonnage: Optional[float] = None
    try:
        targets = list_targets(year=year, db=db)
        for t in targets:
            if t["month"] == month_no:
                target_tonnage = float(t["target_tonnes"])
                break
    except Exception:
        logger.exception("Targets query failed")
        warnings.append("Sales target data unavailable")

    tonnage_achievement_pct = (
        round(total_tonnage / target_tonnage * 100, 1) if target_tonnage else None
    )

    executive_summary_metrics = {
        "total_sales": None,            # No monetary column in fact_sales_lines
        "total_tonnage": round(total_tonnage, 2),
        "invoice_count": invoice_count,
        "customer_count": customer_count,
        "average_daily_sales": None,    # No monetary column
        "average_daily_tonnage": avg_daily_tonnage,
        "target_sales": None,           # No monetary target
        "target_tonnage": target_tonnage,
        "sales_target_achievement_percent": None,
        "tonnage_target_achievement_percent": tonnage_achievement_pct,
        "month_on_month_sales_change_percent": None,
        "month_on_month_tonnage_change_percent": mom_change,
    }

    # ── Daily sales trend ─────────────────────────────────────────────────────
    daily_sales_trend: list = []
    try:
        daily_rows = db.execute(text(f"""
            SELECT
                transaction_date::text                AS date,
                SUM(tonnes)::float                    AS tonnage,
                COUNT(DISTINCT source_no)::int        AS invoice_count
            FROM fact_sales_lines
            WHERE {co_frag} {scope_frag}
              AND transaction_date >= :date_from
              AND transaction_date <= :date_to
            GROUP BY transaction_date
            ORDER BY transaction_date
        """), base_params).mappings().all()

        daily_sales_trend = [
            {
                "date": r["date"],
                "sales": None,
                "tonnage": round(float(r["tonnage"] or 0), 2),
                "invoice_count": int(r["invoice_count"] or 0),
            }
            for r in daily_rows
        ]
    except Exception:
        logger.exception("Daily sales trend query failed")
        warnings.append("Daily sales trend unavailable")

    # ── Top customers (top 10 by tonnage) ────────────────────────────────────
    top_customers: list = []
    try:
        cust_rows = db.execute(text(f"""
            SELECT
                customer_code,
                MAX(customer_name)                     AS customer_name,
                SUM(tonnes)::float                     AS tonnage,
                COUNT(DISTINCT source_no)::int         AS invoice_count
            FROM fact_sales_lines
            WHERE {co_frag} {scope_frag}
              AND transaction_date >= :date_from
              AND transaction_date <= :date_to
              AND customer_code IS NOT NULL
            GROUP BY customer_code
            ORDER BY tonnage DESC
            LIMIT 10
        """), base_params).mappings().all()

        top_customers = [
            {
                "customer_code": r["customer_code"],
                "customer_name": r["customer_name"],
                "sales": None,
                "tonnage": round(float(r["tonnage"] or 0), 2),
                "invoice_count": int(r["invoice_count"] or 0),
                "share_of_total_sales_percent": (
                    round(float(r["tonnage"] or 0) / total_tonnage * 100, 1)
                    if total_tonnage else None
                ),
            }
            for r in cust_rows
        ]
    except Exception:
        logger.exception("Top customers query failed")
        warnings.append("Top customers data unavailable")

    # ── Top products (top 10 by tonnage) ─────────────────────────────────────
    top_products: list = []
    try:
        prod_rows = db.execute(text(f"""
            SELECT
                item_code,
                MAX(item_name)                         AS item_name,
                MAX(item_group_name)                   AS product_group,
                SUM(tonnes)::float                     AS tonnage,
                SUM(quantity)::float                   AS quantity
            FROM fact_sales_lines
            WHERE {co_frag} {scope_frag}
              AND transaction_date >= :date_from
              AND transaction_date <= :date_to
              AND item_code IS NOT NULL
            GROUP BY item_code
            ORDER BY tonnage DESC
            LIMIT 10
        """), base_params).mappings().all()

        top_products = [
            {
                "item_code": r["item_code"],
                "item_name": r["item_name"],
                "product_group": r["product_group"],
                "sales": None,
                "tonnage": round(float(r["tonnage"] or 0), 2),
                "quantity": round(float(r["quantity"] or 0), 2),
                "share_of_total_sales_percent": (
                    round(float(r["tonnage"] or 0) / total_tonnage * 100, 1)
                    if total_tonnage else None
                ),
            }
            for r in prod_rows
        ]
    except Exception:
        logger.exception("Top products query failed")
        warnings.append("Top products data unavailable")

    # ── Sales by product group ────────────────────────────────────────────────
    sales_by_product_group: list = []
    try:
        grp_rows = db.execute(text(f"""
            SELECT
                COALESCE(item_group_code, 'UNKNOWN')   AS product_group_code,
                MAX(item_group_name)                   AS product_group_name,
                SUM(tonnes)::float                     AS tonnage,
                SUM(quantity)::float                   AS quantity
            FROM fact_sales_lines
            WHERE {co_frag} {scope_frag}
              AND transaction_date >= :date_from
              AND transaction_date <= :date_to
            GROUP BY product_group_code
            ORDER BY tonnage DESC
        """), base_params).mappings().all()

        sales_by_product_group = [
            {
                "product_group_code": r["product_group_code"],
                "product_group_name": r["product_group_name"],
                "sales": None,
                "tonnage": round(float(r["tonnage"] or 0), 2),
                "quantity": round(float(r["quantity"] or 0), 2),
                "share_of_total_sales_percent": (
                    round(float(r["tonnage"] or 0) / total_tonnage * 100, 1)
                    if total_tonnage else None
                ),
            }
            for r in grp_rows
        ]
    except Exception:
        logger.exception("Product group breakdown query failed")
        warnings.append("Sales by product group unavailable")

    # ── Dashboard data sections (reuse existing handlers) ────────────────────
    sales_summary_data: dict = {}
    try:
        sales_summary_data = get_sales_summary(
            company_nos=company_nos,
            company_no=None,
            sale_scope=sale_scope,
            date_from=date_from,
            date_to=date_to,
            db=db,
        )
    except Exception:
        logger.exception("Sales summary handler failed")
        warnings.append("Sales summary section unavailable")

    predictive_data: dict = {}
    try:
        predictive_data = get_predictive_insights(
            company_nos=company_nos,
            company_no=None,
            sale_scope=sale_scope,
            db=db,
        )
    except Exception:
        logger.exception("Predictive insights handler failed")
        warnings.append("Predictive insights section unavailable")

    customer_movement_data: dict = {}
    try:
        customer_movement_data = get_customer_movement(
            db=db,
            buyer_status=None,
            action_band=None,
            product_group_code=None,
            customer_code=None,
            salesperson=None,
            sale_scope=sale_scope,
        )
    except Exception:
        logger.exception("Customer movement handler failed")
        warnings.append("Customer movement section unavailable")

    movement_data: dict = {}
    try:
        pg_data = product_group_movement(
            company_nos=company_nos, company_no="all", sale_scope=sale_scope, db=db
        )
        cust_data = customer_movement(
            company_nos=company_nos, company_no="all", sale_scope=sale_scope, db=db
        )
        movement_data = {
            "product_groups": pg_data,
            "customers": cust_data,
        }
    except Exception:
        logger.exception("Movement analytics handler failed")
        warnings.append("Movement analytics section unavailable")

    stock_data: dict = {}
    try:
        stock_data = get_stock_summary(
            company_nos=company_nos, company_no="all", db=db
        )
    except Exception:
        logger.exception("Stock summary handler failed")
        warnings.append("Stock summary section unavailable")

    # ── Data freshness ────────────────────────────────────────────────────────
    last_refreshed_at: Optional[str] = None
    try:
        freshness = get_freshness(db=db)
        last_refreshed_at = freshness.get("last_refresh")
    except Exception:
        pass  # Non-critical — omit silently

    # ── Informational notes (do not affect data_quality.status) ─────────────
    notes = [
        "Monetary sales amounts (USD) are not stored in this dataset. "
        "All sales figures are expressed in tonnes."
    ]

    # ── Target vs actual ─────────────────────────────────────────────────────
    target_vs_actual = {
        "sales": {
            "actual": None,
            "target": None,
            "achievement_percent": None,
            "variance": None,
        },
        "tonnage": {
            "actual": round(total_tonnage, 2),
            "target": target_tonnage,
            "achievement_percent": tonnage_achievement_pct,
            "variance": (
                round(total_tonnage - target_tonnage, 2)
                if target_tonnage is not None else None
            ),
        },
    }

    # ── Chart datasets ────────────────────────────────────────────────────────
    chart_datasets = {
        "daily_sales_trend": [
            {"date": r["date"], "sales": None, "tonnage": r["tonnage"]}
            for r in daily_sales_trend
        ],
        "target_vs_actual": [
            {
                "metric": "Tonnage",
                "actual": round(total_tonnage, 2),
                "target": target_tonnage,
            }
        ],
        "top_customers": [
            {
                "customer_code": c["customer_code"],
                "customer_name": c["customer_name"],
                "tonnage": c["tonnage"],
            }
            for c in top_customers
        ],
        "top_products": [
            {"item_code": p["item_code"], "item_name": p["item_name"], "tonnage": p["tonnage"]}
            for p in top_products
        ],
        "sales_by_product_group": [
            {
                "product_group_name": g["product_group_name"] or g["product_group_code"],
                "tonnage": g["tonnage"],
            }
            for g in sales_by_product_group
        ],
    }

    # ── Assemble final response ───────────────────────────────────────────────
    return {
        "report_title": "Sales Performance Report",
        "report_type": "monthly_sales_performance",
        "period": {
            "month": month,
            "start_date": date_from.isoformat(),
            "end_date": date_to.isoformat(),
            "label": month_label,
        },
        "currency": None,
        "units": {"sales": "tonnes", "tonnage": "tonnes"},
        "executive_summary_metrics": executive_summary_metrics,
        "sales_summary": {
            "description": "The same trusted sales summary data used by the dashboard.",
            "data": sales_summary_data,
        },
        "daily_sales_trend": daily_sales_trend,
        "target_vs_actual": target_vs_actual,
        "top_customers": top_customers,
        "top_products": top_products,
        "sales_by_product_group": sales_by_product_group,
        "customer_movement": {
            "description": "Relevant customer movement analytics currently available on the dashboard.",
            "data": customer_movement_data,
        },
        "movement_analytics": {
            "description": "Relevant product group, customer, and item movement analytics currently available on the dashboard.",
            "data": movement_data,
        },
        "stock_summary": {
            "description": "Relevant stock summary data if available and useful for sales performance commentary.",
            "data": stock_data,
        },
        "predictive_insights": {
            "description": "Relevant predictive insights currently available on the dashboard.",
            "data": predictive_data,
        },
        "chart_datasets": chart_datasets,
        "copilot_guidance": _COPILOT_GUIDANCE,
        "data_quality": {
            "status": "partial" if warnings else "complete",
            "warnings": warnings,
            "notes": notes,
            "last_refreshed_at": last_refreshed_at,
        },
    }
