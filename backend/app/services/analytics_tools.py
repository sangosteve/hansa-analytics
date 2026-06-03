"""
Safe analytics tools for AI insights.
Uses parameterized SQL queries through SQLAlchemy.
Supports company_nos (multi-select) and sale_scope (all/external/internal).
"""

from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.orm import Session

from app.core.filters import ACTIVE_COMPANIES, INTERNAL_CUSTOMER_CODES
from app.db.models import FactSalesLine, CustomerProductGroupMovement


def _company_clause(company_nos: "list[str] | None"):
    """Build a SQLAlchemy company_no filter expression."""
    if not company_nos or "all" in company_nos:
        return FactSalesLine.company_no.in_(list(ACTIVE_COMPANIES))
    valid = [c for c in company_nos if c in ACTIVE_COMPANIES]
    if not valid:
        return FactSalesLine.company_no.in_(list(ACTIVE_COMPANIES))
    if len(valid) == 1:
        return FactSalesLine.company_no == valid[0]
    return FactSalesLine.company_no.in_(valid)


def _scope_clause(sale_scope: "str | None"):
    """Build SQLAlchemy customer_code scope filter expression (or None for 'all')."""
    if not sale_scope or sale_scope == "all":
        return None
    if sale_scope == "internal":
        return FactSalesLine.customer_code.in_(list(INTERNAL_CUSTOMER_CODES))
    if sale_scope == "external":
        return FactSalesLine.customer_code.notin_(list(INTERNAL_CUSTOMER_CODES))
    return None


def _max_date(db: Session, company_nos: "list[str] | None", sale_scope: str = "all") -> date:
    q = select(func.max(FactSalesLine.transaction_date)).where(_company_clause(company_nos))
    sc = _scope_clause(sale_scope)
    if sc is not None:
        q = q.where(sc)
    return db.execute(q).scalar() or date.today()


def get_sales_trend(
    db: Session,
    dimension: str = "total",
    interval: str = "month",
    limit: int = 10,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    location: Optional[str] = None,
    salesperson: Optional[str] = None,
    item_group_code: Optional[str] = None,
    customer_code: Optional[str] = None,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
) -> dict[str, Any]:
    """Get sales trend data with specified dimension."""

    if not date_to:
        date_to = _max_date(db, company_nos, sale_scope)
    if not date_from:
        date_from = date_to - timedelta(days=180)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)

    base_where = [
        co_clause,
        FactSalesLine.transaction_date >= date_from,
        FactSalesLine.transaction_date <= date_to,
    ]
    if sc_clause is not None:
        base_where.append(sc_clause)

    query = select(
        FactSalesLine.transaction_date,
        FactSalesLine.item_group_code,
        FactSalesLine.customer_code,
        FactSalesLine.customer_name,
        FactSalesLine.salesperson,
        FactSalesLine.location,
        func.sum(FactSalesLine.tonnes).label("total_tonnes"),
    ).where(and_(*base_where))

    if location:
        query = query.where(FactSalesLine.location == location)
    if salesperson:
        query = query.where(FactSalesLine.salesperson == salesperson)
    if item_group_code:
        query = query.where(FactSalesLine.item_group_code == item_group_code)
    if customer_code:
        query = query.where(FactSalesLine.customer_code == customer_code)

    query = query.group_by(
        FactSalesLine.transaction_date,
        FactSalesLine.item_group_code,
        FactSalesLine.customer_code,
        FactSalesLine.customer_name,
        FactSalesLine.salesperson,
        FactSalesLine.location,
    ).order_by(FactSalesLine.transaction_date)

    rows = db.execute(query).fetchall()

    return {
        "chart_type": "line",
        "rows": [
            {
                "period": str(r.transaction_date),
                "dimension_name": r.item_group_code
                or r.customer_name
                or r.salesperson
                or r.location
                or "Total",
                "tonnes": float(r.total_tonnes) if r.total_tonnes else 0,
            }
            for r in rows[:limit]
        ],
    }


def get_sales_by_item_group(
    db: Session,
    limit: int = 20,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    location: Optional[str] = None,
    salesperson: Optional[str] = None,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
) -> dict[str, Any]:
    """Get sales aggregated by item group."""

    if not date_to:
        date_to = _max_date(db, company_nos, sale_scope)
    if not date_from:
        date_from = date_to - timedelta(days=180)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)

    base_where = [
        co_clause,
        FactSalesLine.transaction_date >= date_from,
        FactSalesLine.transaction_date <= date_to,
        FactSalesLine.item_group_code.isnot(None),
    ]
    if sc_clause is not None:
        base_where.append(sc_clause)

    query = select(
        FactSalesLine.item_group_code,
        func.sum(FactSalesLine.tonnes).label("total_tonnes"),
    ).where(and_(*base_where))

    if location:
        query = query.where(FactSalesLine.location == location)
    if salesperson:
        query = query.where(FactSalesLine.salesperson == salesperson)

    query = query.group_by(FactSalesLine.item_group_code).order_by(
        func.sum(FactSalesLine.tonnes).desc()
    )

    rows = db.execute(query).fetchall()

    return {
        "chart_type": "bar",
        "rows": [
            {
                "item_group_code": r.item_group_code or "Unknown",
                "item_group_name": r.item_group_code or "Unknown",
                "tonnes": float(r.total_tonnes) if r.total_tonnes else 0,
            }
            for r in rows[:limit]
        ],
    }


def get_sales_by_customer(
    db: Session,
    limit: int = 20,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    location: Optional[str] = None,
    item_group_code: Optional[str] = None,
    salesperson: Optional[str] = None,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
) -> dict[str, Any]:
    """Get sales aggregated by customer."""

    if not date_to:
        date_to = _max_date(db, company_nos, sale_scope)
    if not date_from:
        date_from = date_to - timedelta(days=180)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)

    base_where = [
        co_clause,
        FactSalesLine.transaction_date >= date_from,
        FactSalesLine.transaction_date <= date_to,
        FactSalesLine.customer_code.isnot(None),
    ]
    if sc_clause is not None:
        base_where.append(sc_clause)

    query = select(
        FactSalesLine.customer_code,
        FactSalesLine.customer_name,
        func.sum(FactSalesLine.tonnes).label("total_tonnes"),
    ).where(and_(*base_where))

    if location:
        query = query.where(FactSalesLine.location == location)
    if item_group_code:
        query = query.where(FactSalesLine.item_group_code == item_group_code)
    if salesperson:
        query = query.where(FactSalesLine.salesperson == salesperson)

    query = query.group_by(
        FactSalesLine.customer_code, FactSalesLine.customer_name
    ).order_by(func.sum(FactSalesLine.tonnes).desc())

    rows = db.execute(query).fetchall()

    return {
        "chart_type": "bar",
        "rows": [
            {
                "customer_code": r.customer_code or "Unknown",
                "customer_name": r.customer_name or "Unknown",
                "tonnes": float(r.total_tonnes) if r.total_tonnes else 0,
            }
            for r in rows[:limit]
        ],
    }


def get_sales_by_salesperson(
    db: Session,
    limit: int = 20,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    location: Optional[str] = None,
    item_group_code: Optional[str] = None,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
) -> dict[str, Any]:
    """Get sales aggregated by salesperson."""

    if not date_to:
        date_to = _max_date(db, company_nos, sale_scope)
    if not date_from:
        date_from = date_to - timedelta(days=180)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)

    base_where = [
        co_clause,
        FactSalesLine.transaction_date >= date_from,
        FactSalesLine.transaction_date <= date_to,
        FactSalesLine.salesperson.isnot(None),
    ]
    if sc_clause is not None:
        base_where.append(sc_clause)

    query = select(
        FactSalesLine.salesperson, func.sum(FactSalesLine.tonnes).label("total_tonnes")
    ).where(and_(*base_where))

    if location:
        query = query.where(FactSalesLine.location == location)
    if item_group_code:
        query = query.where(FactSalesLine.item_group_code == item_group_code)

    query = query.group_by(FactSalesLine.salesperson).order_by(
        func.sum(FactSalesLine.tonnes).desc()
    )

    rows = db.execute(query).fetchall()

    return {
        "chart_type": "bar",
        "rows": [
            {
                "salesperson": r.salesperson or "Unknown",
                "tonnes": float(r.total_tonnes) if r.total_tonnes else 0,
            }
            for r in rows[:limit]
        ],
    }


def get_sales_by_location(
    db: Session,
    limit: int = 20,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    item_group_code: Optional[str] = None,
    salesperson: Optional[str] = None,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
) -> dict[str, Any]:
    """Get sales aggregated by location."""

    if not date_to:
        date_to = _max_date(db, company_nos, sale_scope)
    if not date_from:
        date_from = date_to - timedelta(days=180)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)

    base_where = [
        co_clause,
        FactSalesLine.transaction_date >= date_from,
        FactSalesLine.transaction_date <= date_to,
        FactSalesLine.location.isnot(None),
    ]
    if sc_clause is not None:
        base_where.append(sc_clause)

    query = select(
        FactSalesLine.location, func.sum(FactSalesLine.tonnes).label("total_tonnes")
    ).where(and_(*base_where))

    if item_group_code:
        query = query.where(FactSalesLine.item_group_code == item_group_code)
    if salesperson:
        query = query.where(FactSalesLine.salesperson == salesperson)

    query = query.group_by(FactSalesLine.location).order_by(
        func.sum(FactSalesLine.tonnes).desc()
    )

    rows = db.execute(query).fetchall()

    return {
        "chart_type": "bar",
        "rows": [
            {
                "location": r.location or "Unknown",
                "tonnes": float(r.total_tonnes) if r.total_tonnes else 0,
            }
            for r in rows[:limit]
        ],
    }


def get_customer_movement_insights(
    db: Session,
    action_band: Optional[str] = None,
    buyer_status: Optional[str] = None,
    product_group_code: Optional[str] = None,
    location: Optional[str] = None,
    salesperson: Optional[str] = None,
    sale_scope: str = "all",
    limit: int = 20,
) -> dict[str, Any]:
    """Get customer movement insights (declining, stopped, at-risk customers)."""

    query = select(CustomerProductGroupMovement).where(
        CustomerProductGroupMovement.tonnage_gap < 0
    )

    if action_band:
        query = query.where(CustomerProductGroupMovement.action_band == action_band)
    if buyer_status:
        query = query.where(CustomerProductGroupMovement.buyer_status == buyer_status)
    if product_group_code:
        query = query.where(
            CustomerProductGroupMovement.product_group_code == product_group_code
        )
    if location:
        query = query.where(CustomerProductGroupMovement.last_location == location)
    if salesperson:
        query = query.where(CustomerProductGroupMovement.last_salesperson == salesperson)

    if sale_scope == "internal":
        query = query.where(CustomerProductGroupMovement.customer_code.in_(list(INTERNAL_CUSTOMER_CODES)))
    elif sale_scope == "external":
        query = query.where(CustomerProductGroupMovement.customer_code.notin_(list(INTERNAL_CUSTOMER_CODES)))

    query = query.order_by(
        CustomerProductGroupMovement.tonnage_gap.asc(),
        CustomerProductGroupMovement.current_month_tonnes.desc(),
    ).limit(limit)

    rows = db.execute(query).scalars().all()

    return {
        "chart_type": "table",
        "rows": [
            {
                "customer_code": r.customer_code,
                "customer_name": r.customer_name,
                "product_group_code": r.product_group_code,
                "product_group_name": r.product_group_name,
                "current_month_tonnes": float(r.current_month_tonnes) if r.current_month_tonnes else 0,
                "tonnage_gap": float(r.tonnage_gap) if r.tonnage_gap else 0,
                "gap_percent": float(r.gap_percent) if r.gap_percent else 0,
                "action_band": r.action_band,
            }
            for r in rows
        ],
    }


def compare_current_vs_previous_month(
    db: Session,
    dimension: str = "total",
    location: Optional[str] = None,
    item_group_code: Optional[str] = None,
    salesperson: Optional[str] = None,
    customer_code: Optional[str] = None,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
) -> dict[str, Any]:
    """Compare current month vs previous month."""

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)

    max_date = db.execute(
        select(func.max(FactSalesLine.transaction_date)).where(co_clause)
    ).scalar()

    if not max_date:
        return {"rows": [], "chart_type": "bar"}

    current_month_start = date(max_date.year, max_date.month, 1)
    current_month_end = max_date

    if max_date.month == 1:
        prev_month_start = date(max_date.year - 1, 12, 1)
        prev_month_end = date(max_date.year - 1, 12, 31)
    else:
        prev_month_start = date(max_date.year, max_date.month - 1, 1)
        if max_date.month == 3:
            prev_month_end = date(max_date.year, 2, 28)
        else:
            prev_month_end = date(max_date.year, max_date.month - 1, 28)

    def build_query(start, end):
        w = [co_clause, FactSalesLine.transaction_date >= start, FactSalesLine.transaction_date <= end]
        if sc_clause is not None:
            w.append(sc_clause)
        q = select(func.sum(FactSalesLine.tonnes).label("tonnes")).where(and_(*w))
        if location:
            q = q.where(FactSalesLine.location == location)
        if item_group_code:
            q = q.where(FactSalesLine.item_group_code == item_group_code)
        if salesperson:
            q = q.where(FactSalesLine.salesperson == salesperson)
        if customer_code:
            q = q.where(FactSalesLine.customer_code == customer_code)
        return q

    current_tonnes = float(db.execute(build_query(current_month_start, current_month_end)).scalar() or 0)
    previous_tonnes = float(db.execute(build_query(prev_month_start, prev_month_end)).scalar() or 0)

    growth_percent = (
        ((current_tonnes - previous_tonnes) / previous_tonnes * 100)
        if previous_tonnes > 0
        else 0
    )

    return {
        "chart_type": "bar",
        "rows": [
            {"month": "Current", "tonnes": current_tonnes},
            {"month": "Previous", "tonnes": previous_tonnes},
        ],
        "comparison": {
            "current_month_tonnes": current_tonnes,
            "previous_month_tonnes": previous_tonnes,
            "difference": current_tonnes - previous_tonnes,
            "growth_percent": growth_percent,
        },
    }
