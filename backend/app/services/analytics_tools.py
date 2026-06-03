"""
Safe analytics tools for AI insights.
Uses parameterized SQL queries through SQLAlchemy.
Supports company_nos (multi-select) and sale_scope (all/external/internal).
"""

from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy import and_, func, or_, select, text, case
from sqlalchemy.orm import Session

from app.core.filters import ACTIVE_COMPANIES, INTERNAL_CUSTOMER_CODES
from app.db.models import FactSalesLine, CustomerProductGroupMovement, ItemStockStatus


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
    limit: int = 100,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    location: Optional[str] = None,
    salesperson: Optional[str] = None,
    item_group_code: Optional[str] = None,
    customer_code: Optional[str] = None,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
) -> dict[str, Any]:
    """Get monthly sales trend data aggregated by month and optional dimension."""

    if not date_to:
        date_to = _max_date(db, company_nos, sale_scope)
    if not date_from:
        date_from = date_to - timedelta(days=365)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)

    # Build monthly period using date_trunc for clean aggregation
    month_expr = func.date_trunc("month", FactSalesLine.transaction_date).label("period")

    base_where = [
        co_clause,
        FactSalesLine.transaction_date >= date_from,
        FactSalesLine.transaction_date <= date_to,
    ]
    if sc_clause is not None:
        base_where.append(sc_clause)
    if location:
        base_where.append(FactSalesLine.location == location)
    if salesperson:
        base_where.append(FactSalesLine.salesperson == salesperson)
    if item_group_code:
        base_where.append(FactSalesLine.item_group_code == item_group_code)
    if customer_code:
        base_where.append(FactSalesLine.customer_code == customer_code)

    if dimension == "item_group":
        query = (
            select(
                month_expr,
                FactSalesLine.item_group_code,
                FactSalesLine.item_group_name,
                func.sum(FactSalesLine.tonnes).label("total_tonnes"),
            )
            .where(and_(*base_where))
            .where(FactSalesLine.item_group_code.isnot(None))
            .group_by(func.date_trunc("month", FactSalesLine.transaction_date), FactSalesLine.item_group_code, FactSalesLine.item_group_name)
            .order_by(func.date_trunc("month", FactSalesLine.transaction_date))
        )
        rows = db.execute(query).fetchall()
        return {
            "chart_type": "line",
            "dimension": "item_group",
            "rows": [
                {
                    "period": str(r.period)[:7],
                    "dimension_name": r.item_group_name or r.item_group_code or "Unknown",
                    "tonnes": float(r.total_tonnes) if r.total_tonnes else 0,
                }
                for r in rows[:limit]
            ],
        }

    elif dimension == "customer":
        query = (
            select(
                month_expr,
                FactSalesLine.customer_code,
                FactSalesLine.customer_name,
                func.sum(FactSalesLine.tonnes).label("total_tonnes"),
            )
            .where(and_(*base_where))
            .where(FactSalesLine.customer_code.isnot(None))
            .group_by(func.date_trunc("month", FactSalesLine.transaction_date), FactSalesLine.customer_code, FactSalesLine.customer_name)
            .order_by(func.date_trunc("month", FactSalesLine.transaction_date))
        )
        rows = db.execute(query).fetchall()
        return {
            "chart_type": "line",
            "dimension": "customer",
            "rows": [
                {
                    "period": str(r.period)[:7],
                    "dimension_name": r.customer_name or r.customer_code or "Unknown",
                    "tonnes": float(r.total_tonnes) if r.total_tonnes else 0,
                }
                for r in rows[:limit]
            ],
        }

    elif dimension == "salesperson":
        query = (
            select(
                month_expr,
                FactSalesLine.salesperson,
                func.sum(FactSalesLine.tonnes).label("total_tonnes"),
            )
            .where(and_(*base_where))
            .where(FactSalesLine.salesperson.isnot(None))
            .group_by(func.date_trunc("month", FactSalesLine.transaction_date), FactSalesLine.salesperson)
            .order_by(func.date_trunc("month", FactSalesLine.transaction_date))
        )
        rows = db.execute(query).fetchall()
        return {
            "chart_type": "line",
            "dimension": "salesperson",
            "rows": [
                {
                    "period": str(r.period)[:7],
                    "dimension_name": r.salesperson or "Unknown",
                    "tonnes": float(r.total_tonnes) if r.total_tonnes else 0,
                }
                for r in rows[:limit]
            ],
        }

    elif dimension == "location":
        query = (
            select(
                month_expr,
                FactSalesLine.location,
                func.sum(FactSalesLine.tonnes).label("total_tonnes"),
            )
            .where(and_(*base_where))
            .where(FactSalesLine.location.isnot(None))
            .group_by(func.date_trunc("month", FactSalesLine.transaction_date), FactSalesLine.location)
            .order_by(func.date_trunc("month", FactSalesLine.transaction_date))
        )
        rows = db.execute(query).fetchall()
        return {
            "chart_type": "line",
            "dimension": "location",
            "rows": [
                {
                    "period": str(r.period)[:7],
                    "dimension_name": r.location or "Unknown",
                    "tonnes": float(r.total_tonnes) if r.total_tonnes else 0,
                }
                for r in rows[:limit]
            ],
        }

    else:
        # Total
        query = (
            select(
                month_expr,
                func.sum(FactSalesLine.tonnes).label("total_tonnes"),
            )
            .where(and_(*base_where))
            .group_by(func.date_trunc("month", FactSalesLine.transaction_date))
            .order_by(func.date_trunc("month", FactSalesLine.transaction_date))
        )
        rows = db.execute(query).fetchall()
        return {
            "chart_type": "line",
            "dimension": "total",
            "rows": [
                {
                    "period": str(r.period)[:7],
                    "dimension_name": "Total",
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
        FactSalesLine.item_group_name,
        func.sum(FactSalesLine.tonnes).label("total_tonnes"),
    ).where(and_(*base_where))

    if location:
        query = query.where(FactSalesLine.location == location)
    if salesperson:
        query = query.where(FactSalesLine.salesperson == salesperson)

    query = query.group_by(FactSalesLine.item_group_code, FactSalesLine.item_group_name).order_by(
        func.sum(FactSalesLine.tonnes).desc()
    )

    rows = db.execute(query).fetchall()

    return {
        "chart_type": "bar",
        "rows": [
            {
                "item_group_code": r.item_group_code or "Unknown",
                "item_group_name": r.item_group_name or r.item_group_code or "Unknown",
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
    limit: int = 30,
) -> dict[str, Any]:
    """Get customer movement insights (declining, stopped, at-risk customers)."""

    query = select(CustomerProductGroupMovement)

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
        CustomerProductGroupMovement.avg_monthly_tonnes_6m.desc(),
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
                "avg_monthly_tonnes_6m": float(r.avg_monthly_tonnes_6m) if r.avg_monthly_tonnes_6m else 0,
                "current_month_tonnes": float(r.current_month_tonnes) if r.current_month_tonnes else 0,
                "tonnage_gap": float(r.tonnage_gap) if r.tonnage_gap else 0,
                "gap_percent": float(r.gap_percent) if r.gap_percent else 0,
                "buyer_status": r.buyer_status,
                "action_band": r.action_band,
                "days_since_last_purchase": r.days_since_last_purchase,
                "last_salesperson": r.last_salesperson,
            }
            for r in rows
        ],
    }


def get_churned_customers(
    db: Session,
    days_inactive: int = 60,
    product_group_code: Optional[str] = None,
    location: Optional[str] = None,
    salesperson: Optional[str] = None,
    sale_scope: str = "all",
    limit: int = 30,
) -> dict[str, Any]:
    """
    Get customers who have stopped buying — those with purchases in the past
    but no activity in the last N days, ordered by their historical volume.
    """
    query = (
        select(CustomerProductGroupMovement)
        .where(
            and_(
                CustomerProductGroupMovement.days_since_last_purchase >= days_inactive,
                CustomerProductGroupMovement.avg_monthly_tonnes_6m > 0,
            )
        )
    )

    if product_group_code:
        query = query.where(CustomerProductGroupMovement.product_group_code == product_group_code)
    if location:
        query = query.where(CustomerProductGroupMovement.last_location == location)
    if salesperson:
        query = query.where(CustomerProductGroupMovement.last_salesperson == salesperson)

    if sale_scope == "internal":
        query = query.where(CustomerProductGroupMovement.customer_code.in_(list(INTERNAL_CUSTOMER_CODES)))
    elif sale_scope == "external":
        query = query.where(CustomerProductGroupMovement.customer_code.notin_(list(INTERNAL_CUSTOMER_CODES)))

    query = query.order_by(
        CustomerProductGroupMovement.avg_monthly_tonnes_6m.desc()
    ).limit(limit)

    rows = db.execute(query).scalars().all()

    return {
        "chart_type": "table",
        "context": f"Customers with no purchases in the last {days_inactive} days who previously bought regularly.",
        "rows": [
            {
                "customer_name": r.customer_name,
                "customer_code": r.customer_code,
                "product_group_name": r.product_group_name or r.product_group_code,
                "avg_monthly_tonnes_6m": float(r.avg_monthly_tonnes_6m) if r.avg_monthly_tonnes_6m else 0,
                "last_purchase_date": str(r.last_purchase_date) if r.last_purchase_date else None,
                "days_since_last_purchase": r.days_since_last_purchase,
                "buyer_status": r.buyer_status,
                "action_band": r.action_band,
                "last_salesperson": r.last_salesperson,
            }
            for r in rows
        ],
    }


def get_declining_product_groups(
    db: Session,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
    location: Optional[str] = None,
    salesperson: Optional[str] = None,
    limit: int = 20,
) -> dict[str, Any]:
    """
    Compare product group sales: recent 3 months vs prior 3 months.
    Returns groups sorted by biggest decline in tonnes.
    """
    max_dt = _max_date(db, company_nos, sale_scope)

    recent_end = max_dt
    recent_start = date(max_dt.year, max_dt.month, 1) - timedelta(days=60)
    prior_end = recent_start - timedelta(days=1)
    prior_start = prior_end - timedelta(days=89)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)

    def period_query(start: date, end: date):
        w = [
            co_clause,
            FactSalesLine.transaction_date >= start,
            FactSalesLine.transaction_date <= end,
            FactSalesLine.item_group_code.isnot(None),
        ]
        if sc_clause is not None:
            w.append(sc_clause)
        if location:
            w.append(FactSalesLine.location == location)
        if salesperson:
            w.append(FactSalesLine.salesperson == salesperson)
        return (
            select(
                FactSalesLine.item_group_code,
                FactSalesLine.item_group_name,
                func.sum(FactSalesLine.tonnes).label("tonnes"),
            )
            .where(and_(*w))
            .group_by(FactSalesLine.item_group_code, FactSalesLine.item_group_name)
        )

    recent_rows = {r.item_group_code: (r.item_group_name, float(r.tonnes or 0)) for r in db.execute(period_query(recent_start, recent_end)).fetchall()}
    prior_rows = {r.item_group_code: float(r.tonnes or 0) for r in db.execute(period_query(prior_start, prior_end)).fetchall()}

    all_groups = set(recent_rows.keys()) | set(prior_rows.keys())
    results = []
    for code in all_groups:
        name, recent = recent_rows.get(code, (code, 0))
        prior = prior_rows.get(code, 0)
        change = recent - prior
        pct = ((change / prior) * 100) if prior > 0 else (100 if recent > 0 else 0)
        results.append({
            "item_group_code": code,
            "item_group_name": name or code,
            "recent_3m_tonnes": round(recent, 2),
            "prior_3m_tonnes": round(prior, 2),
            "change_tonnes": round(change, 2),
            "change_pct": round(pct, 1),
            "trend": "declining" if change < 0 else ("growing" if change > 0 else "flat"),
        })

    results.sort(key=lambda x: x["change_tonnes"])

    return {
        "chart_type": "bar",
        "context": f"Comparing recent 3 months ({recent_start} to {recent_end}) vs prior 3 months ({prior_start} to {prior_end})",
        "periods": {
            "recent": {"from": str(recent_start), "to": str(recent_end)},
            "prior": {"from": str(prior_start), "to": str(prior_end)},
        },
        "rows": results[:limit],
    }


def get_stock_recommendations(
    db: Session,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
    location: Optional[str] = None,
    item_group_code: Optional[str] = None,
    limit: int = 30,
) -> dict[str, Any]:
    """
    Stock recommendations: compare current stock vs recent monthly sales velocity
    to identify items that are running low or overstocked.
    """
    max_dt = _max_date(db, company_nos, sale_scope)
    period_start = max_dt - timedelta(days=90)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)

    sales_where = [
        co_clause,
        FactSalesLine.transaction_date >= period_start,
        FactSalesLine.transaction_date <= max_dt,
        FactSalesLine.item_code.isnot(None),
    ]
    if sc_clause is not None:
        sales_where.append(sc_clause)
    if item_group_code:
        sales_where.append(FactSalesLine.item_group_code == item_group_code)

    sales_q = (
        select(
            FactSalesLine.item_code,
            FactSalesLine.item_group_code,
            FactSalesLine.item_group_name,
            func.sum(FactSalesLine.tonnes).label("tonnes_90d"),
            func.count(func.distinct(FactSalesLine.transaction_date)).label("active_days"),
        )
        .where(and_(*sales_where))
        .group_by(FactSalesLine.item_code, FactSalesLine.item_group_code, FactSalesLine.item_group_name)
        .order_by(func.sum(FactSalesLine.tonnes).desc())
    )
    sales_rows = {r.item_code: r for r in db.execute(sales_q).fetchall()}

    stock_where = []
    if company_nos and "all" not in company_nos:
        valid = [c for c in company_nos if c in ACTIVE_COMPANIES]
        if valid:
            stock_where.append(ItemStockStatus.company_no.in_(valid))
    if location:
        stock_where.append(ItemStockStatus.location == location)
    if item_group_code:
        stock_where.append(ItemStockStatus.item_group_code == item_group_code)

    stock_q = select(
        ItemStockStatus.art_code,
        ItemStockStatus.item_name,
        ItemStockStatus.item_group_code,
        ItemStockStatus.item_group_name,
        ItemStockStatus.location,
        func.sum(ItemStockStatus.instock).label("total_instock"),
        func.sum(ItemStockStatus.ord_out).label("total_ord_out"),
        func.sum(ItemStockStatus.po_qty).label("total_po_qty"),
    ).group_by(
        ItemStockStatus.art_code,
        ItemStockStatus.item_name,
        ItemStockStatus.item_group_code,
        ItemStockStatus.item_group_name,
        ItemStockStatus.location,
    )
    if stock_where:
        stock_q = stock_q.where(and_(*stock_where))

    stock_rows = {r.art_code: r for r in db.execute(stock_q).fetchall()}

    results = []
    for item_code, sales in sales_rows.items():
        stock = stock_rows.get(item_code)
        monthly_velocity = float(sales.tonnes_90d or 0) / 3
        instock = float(stock.total_instock or 0) if stock else 0
        po_qty = float(stock.total_po_qty or 0) if stock else 0
        ord_out = float(stock.total_ord_out or 0) if stock else 0

        months_cover = (instock / monthly_velocity) if monthly_velocity > 0 else 99
        status = (
            "critical_low" if months_cover < 0.5
            else "low_stock" if months_cover < 1.5
            else "adequate" if months_cover < 4
            else "overstocked"
        )

        results.append({
            "item_code": item_code,
            "item_name": stock.item_name if stock else item_code,
            "item_group_name": sales.item_group_name or sales.item_group_code or "Unknown",
            "current_stock_tonnes": round(instock, 2),
            "monthly_sales_velocity": round(monthly_velocity, 2),
            "months_of_cover": round(months_cover, 1) if months_cover < 99 else None,
            "po_qty": round(po_qty, 2),
            "pending_orders": round(ord_out, 2),
            "stock_status": status,
        })

    results.sort(key=lambda x: x.get("months_of_cover") or 99)

    return {
        "chart_type": "table",
        "context": f"Stock analysis based on 90-day sales velocity ending {max_dt}. Months of cover = current stock ÷ monthly velocity.",
        "rows": results[:limit],
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
            {"month": f"Current ({current_month_start.strftime('%b %Y')})", "tonnes": current_tonnes},
            {"month": f"Previous ({prev_month_start.strftime('%b %Y')})", "tonnes": previous_tonnes},
        ],
        "comparison": {
            "current_month": current_month_start.strftime("%B %Y"),
            "current_month_tonnes": current_tonnes,
            "previous_month": prev_month_start.strftime("%B %Y"),
            "previous_month_tonnes": previous_tonnes,
            "difference": current_tonnes - previous_tonnes,
            "growth_percent": round(growth_percent, 1),
        },
    }
