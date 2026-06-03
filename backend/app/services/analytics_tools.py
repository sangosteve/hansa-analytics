"""
Safe analytics tools for AI insights.
Uses parameterized SQL queries through SQLAlchemy.
Supports company_nos (multi-select) and sale_scope (all/external/internal).

NOTE: The customer_product_group_movement table may be empty — all movement/churn
analysis falls back to fact_sales_lines which always has data.
"""

from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy import and_, func, select, Label
from sqlalchemy.orm import Session

from app.core.filters import ACTIVE_COMPANIES, INTERNAL_CUSTOMER_CODES
from app.db.models import FactSalesLine, CustomerProductGroupMovement, ItemStockStatus


# ─── Shared helpers ────────────────────────────────────────────────────────────

def _valid_companies(company_nos: "list[str] | None") -> list[str]:
    if not company_nos or "all" in company_nos:
        return list(ACTIVE_COMPANIES)
    valid = [c for c in company_nos if c in ACTIVE_COMPANIES]
    return valid if valid else list(ACTIVE_COMPANIES)


def _company_clause(company_nos: "list[str] | None"):
    companies = _valid_companies(company_nos)
    if len(companies) == 1:
        return FactSalesLine.company_no == companies[0]
    return FactSalesLine.company_no.in_(companies)


def _movement_company_clause(company_nos: "list[str] | None"):
    companies = _valid_companies(company_nos)
    if len(companies) == 1:
        return CustomerProductGroupMovement.company_no == companies[0]
    return CustomerProductGroupMovement.company_no.in_(companies)


def _scope_clause(sale_scope: "str | None"):
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


def _multi_company(company_nos: "list[str] | None") -> bool:
    """True when query spans more than one company — triggers breakdown grouping."""
    companies = _valid_companies(company_nos)
    return len(companies) > 1


# ─── Sales trend ───────────────────────────────────────────────────────────────

def get_sales_trend(
    db: Session,
    dimension: str = "total",
    interval: str = "month",
    limit: int = 200,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    location: Optional[str] = None,
    salesperson: Optional[str] = None,
    item_group_code: Optional[str] = None,
    customer_code: Optional[str] = None,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
) -> dict[str, Any]:
    """Monthly sales trend, optionally broken down by dimension and/or company."""

    if not date_to:
        date_to = _max_date(db, company_nos, sale_scope)
    if not date_from:
        date_from = date_to - timedelta(days=365)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)
    multi = _multi_company(company_nos)

    month_expr = func.date_trunc("month", FactSalesLine.transaction_date)

    base_where = [co_clause, FactSalesLine.transaction_date >= date_from,
                  FactSalesLine.transaction_date <= date_to]
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

    # Build group-by columns dynamically
    group_cols = [month_expr]
    select_cols = [month_expr.label("period"), func.sum(FactSalesLine.tonnes).label("total_tonnes")]

    dim_col = None
    if dimension == "item_group":
        dim_col = FactSalesLine.item_group_name
        group_cols += [FactSalesLine.item_group_code, FactSalesLine.item_group_name]
        select_cols += [FactSalesLine.item_group_code, FactSalesLine.item_group_name]
        base_where.append(FactSalesLine.item_group_code.isnot(None))
    elif dimension == "customer":
        dim_col = FactSalesLine.customer_name
        group_cols += [FactSalesLine.customer_code, FactSalesLine.customer_name]
        select_cols += [FactSalesLine.customer_code, FactSalesLine.customer_name]
        base_where.append(FactSalesLine.customer_code.isnot(None))
    elif dimension == "salesperson":
        dim_col = FactSalesLine.salesperson
        group_cols += [FactSalesLine.salesperson]
        select_cols += [FactSalesLine.salesperson]
        base_where.append(FactSalesLine.salesperson.isnot(None))
    elif dimension == "location":
        dim_col = FactSalesLine.location
        group_cols += [FactSalesLine.location]
        select_cols += [FactSalesLine.location]
        base_where.append(FactSalesLine.location.isnot(None))

    # Always include company_no when spanning multiple companies
    if multi:
        group_cols.append(FactSalesLine.company_no)
        select_cols.append(FactSalesLine.company_no)

    query = (
        select(*select_cols)
        .where(and_(*base_where))
        .group_by(*group_cols)
        .order_by(month_expr)
    )

    rows = db.execute(query).fetchall()

    def dim_name(r):
        if dimension == "item_group":
            return getattr(r, "item_group_name", None) or getattr(r, "item_group_code", None) or "Unknown"
        elif dimension == "customer":
            return getattr(r, "customer_name", None) or getattr(r, "customer_code", None) or "Unknown"
        elif dimension == "salesperson":
            return getattr(r, "salesperson", None) or "Unknown"
        elif dimension == "location":
            return getattr(r, "location", None) or "Unknown"
        return "Total"

    return {
        "chart_type": "line",
        "dimension": dimension,
        "date_range": {"from": str(date_from), "to": str(date_to)},
        "rows": [
            {
                "period": str(r.period)[:7],
                "dimension_name": dim_name(r),
                "company_no": getattr(r, "company_no", None) if multi else None,
                "tonnes": float(r.total_tonnes) if r.total_tonnes else 0,
            }
            for r in rows[:limit]
        ],
    }


# ─── Sales by item group ────────────────────────────────────────────────────────

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
    """Sales by product group. When multiple companies selected, breaks down by company."""

    if not date_to:
        date_to = _max_date(db, company_nos, sale_scope)
    if not date_from:
        date_from = date_to - timedelta(days=180)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)
    multi = _multi_company(company_nos)

    base_where = [co_clause, FactSalesLine.transaction_date >= date_from,
                  FactSalesLine.transaction_date <= date_to,
                  FactSalesLine.item_group_code.isnot(None)]
    if sc_clause is not None:
        base_where.append(sc_clause)
    if location:
        base_where.append(FactSalesLine.location == location)
    if salesperson:
        base_where.append(FactSalesLine.salesperson == salesperson)

    group_cols = [FactSalesLine.item_group_code, FactSalesLine.item_group_name]
    select_cols = [FactSalesLine.item_group_code, FactSalesLine.item_group_name,
                   func.sum(FactSalesLine.tonnes).label("total_tonnes")]
    if multi:
        group_cols.append(FactSalesLine.company_no)
        select_cols.append(FactSalesLine.company_no)

    query = (
        select(*select_cols)
        .where(and_(*base_where))
        .group_by(*group_cols)
        .order_by(func.sum(FactSalesLine.tonnes).desc())
    )

    rows = db.execute(query).fetchall()
    return {
        "chart_type": "bar",
        "date_range": {"from": str(date_from), "to": str(date_to)},
        "rows": [
            {
                "item_group_code": r.item_group_code or "Unknown",
                "item_group_name": r.item_group_name or r.item_group_code or "Unknown",
                "company_no": getattr(r, "company_no", None) if multi else None,
                "tonnes": float(r.total_tonnes) if r.total_tonnes else 0,
            }
            for r in rows[:limit]
        ],
    }


# ─── Sales by customer ─────────────────────────────────────────────────────────

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
    """Sales by customer. Includes company_no when spanning multiple companies."""

    if not date_to:
        date_to = _max_date(db, company_nos, sale_scope)
    if not date_from:
        date_from = date_to - timedelta(days=180)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)
    multi = _multi_company(company_nos)

    base_where = [co_clause, FactSalesLine.transaction_date >= date_from,
                  FactSalesLine.transaction_date <= date_to,
                  FactSalesLine.customer_code.isnot(None)]
    if sc_clause is not None:
        base_where.append(sc_clause)
    if location:
        base_where.append(FactSalesLine.location == location)
    if item_group_code:
        base_where.append(FactSalesLine.item_group_code == item_group_code)
    if salesperson:
        base_where.append(FactSalesLine.salesperson == salesperson)

    group_cols = [FactSalesLine.customer_code, FactSalesLine.customer_name]
    select_cols = [FactSalesLine.customer_code, FactSalesLine.customer_name,
                   func.sum(FactSalesLine.tonnes).label("total_tonnes")]
    if multi:
        group_cols.append(FactSalesLine.company_no)
        select_cols.append(FactSalesLine.company_no)

    query = (
        select(*select_cols)
        .where(and_(*base_where))
        .group_by(*group_cols)
        .order_by(func.sum(FactSalesLine.tonnes).desc())
    )

    rows = db.execute(query).fetchall()
    return {
        "chart_type": "bar",
        "date_range": {"from": str(date_from), "to": str(date_to)},
        "rows": [
            {
                "customer_code": r.customer_code or "Unknown",
                "customer_name": r.customer_name or "Unknown",
                "company_no": getattr(r, "company_no", None) if multi else None,
                "tonnes": float(r.total_tonnes) if r.total_tonnes else 0,
            }
            for r in rows[:limit]
        ],
    }


# ─── Sales by salesperson ──────────────────────────────────────────────────────

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
    """Sales by salesperson. Includes company_no breakdown when spanning multiple companies."""

    if not date_to:
        date_to = _max_date(db, company_nos, sale_scope)
    if not date_from:
        date_from = date_to - timedelta(days=180)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)
    multi = _multi_company(company_nos)

    base_where = [co_clause, FactSalesLine.transaction_date >= date_from,
                  FactSalesLine.transaction_date <= date_to,
                  FactSalesLine.salesperson.isnot(None)]
    if sc_clause is not None:
        base_where.append(sc_clause)
    if location:
        base_where.append(FactSalesLine.location == location)
    if item_group_code:
        base_where.append(FactSalesLine.item_group_code == item_group_code)

    group_cols = [FactSalesLine.salesperson]
    select_cols = [FactSalesLine.salesperson, func.sum(FactSalesLine.tonnes).label("total_tonnes")]
    if multi:
        group_cols.append(FactSalesLine.company_no)
        select_cols.append(FactSalesLine.company_no)

    query = (
        select(*select_cols)
        .where(and_(*base_where))
        .group_by(*group_cols)
        .order_by(func.sum(FactSalesLine.tonnes).desc())
    )

    rows = db.execute(query).fetchall()
    return {
        "chart_type": "bar",
        "date_range": {"from": str(date_from), "to": str(date_to)},
        "rows": [
            {
                "salesperson": r.salesperson or "Unknown",
                "company_no": getattr(r, "company_no", None) if multi else None,
                "tonnes": float(r.total_tonnes) if r.total_tonnes else 0,
            }
            for r in rows[:limit]
        ],
    }


# ─── Sales by location ─────────────────────────────────────────────────────────

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
    """Sales by location/branch. Includes company_no when spanning multiple companies."""

    if not date_to:
        date_to = _max_date(db, company_nos, sale_scope)
    if not date_from:
        date_from = date_to - timedelta(days=180)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)
    multi = _multi_company(company_nos)

    base_where = [co_clause, FactSalesLine.transaction_date >= date_from,
                  FactSalesLine.transaction_date <= date_to,
                  FactSalesLine.location.isnot(None)]
    if sc_clause is not None:
        base_where.append(sc_clause)
    if item_group_code:
        base_where.append(FactSalesLine.item_group_code == item_group_code)
    if salesperson:
        base_where.append(FactSalesLine.salesperson == salesperson)

    group_cols = [FactSalesLine.location]
    select_cols = [FactSalesLine.location, func.sum(FactSalesLine.tonnes).label("total_tonnes")]
    if multi:
        group_cols.append(FactSalesLine.company_no)
        select_cols.append(FactSalesLine.company_no)

    query = (
        select(*select_cols)
        .where(and_(*base_where))
        .group_by(*group_cols)
        .order_by(func.sum(FactSalesLine.tonnes).desc())
    )

    rows = db.execute(query).fetchall()
    return {
        "chart_type": "bar",
        "date_range": {"from": str(date_from), "to": str(date_to)},
        "rows": [
            {
                "location": r.location or "Unknown",
                "company_no": getattr(r, "company_no", None) if multi else None,
                "tonnes": float(r.total_tonnes) if r.total_tonnes else 0,
            }
            for r in rows[:limit]
        ],
    }


# ─── Declining product groups ──────────────────────────────────────────────────

def get_declining_product_groups(
    db: Session,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
    location: Optional[str] = None,
    salesperson: Optional[str] = None,
    limit: int = 30,
) -> dict[str, Any]:
    """
    Compare product group sales: recent 3 months vs prior 3 months.
    When multiple companies selected, breaks down results by company.
    """
    max_dt = _max_date(db, company_nos, sale_scope)
    recent_end = max_dt
    recent_start = date(max_dt.year, max_dt.month, 1) - timedelta(days=60)
    prior_end = recent_start - timedelta(days=1)
    prior_start = prior_end - timedelta(days=89)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)
    multi = _multi_company(company_nos)

    def period_query(start: date, end: date):
        w = [co_clause, FactSalesLine.transaction_date >= start,
             FactSalesLine.transaction_date <= end,
             FactSalesLine.item_group_code.isnot(None)]
        if sc_clause is not None:
            w.append(sc_clause)
        if location:
            w.append(FactSalesLine.location == location)
        if salesperson:
            w.append(FactSalesLine.salesperson == salesperson)

        group_cols = [FactSalesLine.item_group_code, FactSalesLine.item_group_name]
        select_cols = [FactSalesLine.item_group_code, FactSalesLine.item_group_name,
                       func.sum(FactSalesLine.tonnes).label("tonnes")]
        if multi:
            group_cols.append(FactSalesLine.company_no)
            select_cols.append(FactSalesLine.company_no)

        return select(*select_cols).where(and_(*w)).group_by(*group_cols)

    recent_map: dict[tuple, tuple] = {}
    for r in db.execute(period_query(recent_start, recent_end)).fetchall():
        key = (getattr(r, "company_no", "all"), r.item_group_code)
        recent_map[key] = (r.item_group_name, float(r.tonnes or 0))

    prior_map: dict[tuple, float] = {}
    for r in db.execute(period_query(prior_start, prior_end)).fetchall():
        key = (getattr(r, "company_no", "all"), r.item_group_code)
        prior_map[key] = float(r.tonnes or 0)

    all_keys = set(recent_map.keys()) | set(prior_map.keys())
    results = []
    for key in all_keys:
        company_no, code = key
        name, recent = recent_map.get(key, (code, 0))
        prior = prior_map.get(key, 0)
        change = recent - prior
        pct = ((change / prior) * 100) if prior > 0 else (100 if recent > 0 else 0)
        results.append({
            "company_no": company_no if multi else None,
            "item_group_code": code,
            "item_group_name": name or code,
            "recent_3m_tonnes": round(recent, 2),
            "prior_3m_tonnes": round(prior, 2),
            "change_tonnes": round(change, 2),
            "change_pct": round(pct, 1),
            "trend": "declining" if change < -0.1 else ("growing" if change > 0.1 else "flat"),
        })

    results.sort(key=lambda x: x["change_tonnes"])

    return {
        "chart_type": "bar",
        "context": f"Recent 3 months ({recent_start} → {recent_end}) vs prior 3 months ({prior_start} → {prior_end})",
        "periods": {"recent": {"from": str(recent_start), "to": str(recent_end)},
                    "prior": {"from": str(prior_start), "to": str(prior_end)}},
        "rows": results[:limit],
    }


# ─── Churned customers (from fact_sales_lines) ────────────────────────────────

def get_churned_customers(
    db: Session,
    days_inactive: int = 60,
    product_group_code: Optional[str] = None,
    location: Optional[str] = None,
    salesperson: Optional[str] = None,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
    limit: int = 40,
) -> dict[str, Any]:
    """
    Customers who stopped buying: had purchases in the 6-month lookback window
    but their last purchase was more than `days_inactive` days before the data max date.
    Sorted by historical monthly volume — biggest losses first.
    Always queries fact_sales_lines directly (does not rely on movement table).
    """
    max_dt = _max_date(db, company_nos, sale_scope)
    six_months_ago = max_dt - timedelta(days=180)
    churn_cutoff = max_dt - timedelta(days=days_inactive)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)
    multi = _multi_company(company_nos)

    base_where = [
        co_clause,
        FactSalesLine.transaction_date >= six_months_ago,
        FactSalesLine.transaction_date <= max_dt,
        FactSalesLine.customer_code.isnot(None),
    ]
    if sc_clause is not None:
        base_where.append(sc_clause)
    if product_group_code:
        base_where.append(FactSalesLine.item_group_code == product_group_code)
    if location:
        base_where.append(FactSalesLine.location == location)
    if salesperson:
        base_where.append(FactSalesLine.salesperson == salesperson)

    group_cols = [FactSalesLine.customer_code, FactSalesLine.customer_name,
                  FactSalesLine.item_group_code, FactSalesLine.item_group_name]
    select_cols = [
        FactSalesLine.customer_code,
        FactSalesLine.customer_name,
        FactSalesLine.item_group_code,
        FactSalesLine.item_group_name,
        func.max(FactSalesLine.transaction_date).label("last_purchase_date"),
        func.sum(FactSalesLine.tonnes).label("tonnes_6m"),
        (func.max(FactSalesLine.salesperson)).label("last_salesperson"),
        (func.max(FactSalesLine.location)).label("last_location"),
    ]
    if multi:
        group_cols.append(FactSalesLine.company_no)
        select_cols.append(FactSalesLine.company_no)

    query = (
        select(*select_cols)
        .where(and_(*base_where))
        .group_by(*group_cols)
        .having(func.max(FactSalesLine.transaction_date) < churn_cutoff)
        .order_by(func.sum(FactSalesLine.tonnes).desc())
        .limit(limit)
    )

    rows = db.execute(query).fetchall()

    result_rows = []
    for r in rows:
        last_dt = r.last_purchase_date
        days_gone = (max_dt - last_dt).days if last_dt else None
        avg_monthly = float(r.tonnes_6m or 0) / 6
        result_rows.append({
            "company_no": getattr(r, "company_no", None) if multi else None,
            "customer_name": r.customer_name or r.customer_code,
            "customer_code": r.customer_code,
            "product_group_name": r.item_group_name or r.item_group_code,
            "avg_monthly_tonnes": round(avg_monthly, 2),
            "last_purchase_date": str(last_dt) if last_dt else None,
            "days_since_last_purchase": days_gone,
            "last_salesperson": r.last_salesperson,
            "last_location": r.last_location,
        })

    return {
        "chart_type": "table",
        "context": (
            f"Customers inactive for >{days_inactive} days as of {max_dt}. "
            f"Showing {len(result_rows)} customer/product combinations sorted by 6-month volume."
        ),
        "reference_date": str(max_dt),
        "churn_cutoff": str(churn_cutoff),
        "rows": result_rows,
    }


# ─── Customer movement / at-risk (from fact_sales_lines) ──────────────────────

def get_customer_movement_insights(
    db: Session,
    action_band: Optional[str] = None,
    buyer_status: Optional[str] = None,
    product_group_code: Optional[str] = None,
    location: Optional[str] = None,
    salesperson: Optional[str] = None,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
    limit: int = 40,
) -> dict[str, Any]:
    """
    At-risk / declining customers: compares recent 2-month volume vs prior 2-month volume.
    A negative gap means the customer is buying less than before.
    Always computed from fact_sales_lines directly.
    """
    max_dt = _max_date(db, company_nos, sale_scope)
    recent_end = max_dt
    recent_start = max_dt - timedelta(days=60)
    prior_end = recent_start - timedelta(days=1)
    prior_start = prior_end - timedelta(days=59)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)
    multi = _multi_company(company_nos)

    def build_period(start, end):
        w = [co_clause, FactSalesLine.transaction_date >= start,
             FactSalesLine.transaction_date <= end,
             FactSalesLine.customer_code.isnot(None)]
        if sc_clause is not None:
            w.append(sc_clause)
        if product_group_code:
            w.append(FactSalesLine.item_group_code == product_group_code)
        if location:
            w.append(FactSalesLine.location == location)
        if salesperson:
            w.append(FactSalesLine.salesperson == salesperson)

        grp = [FactSalesLine.customer_code, FactSalesLine.customer_name,
               FactSalesLine.item_group_code, FactSalesLine.item_group_name]
        sel = [FactSalesLine.customer_code, FactSalesLine.customer_name,
               FactSalesLine.item_group_code, FactSalesLine.item_group_name,
               func.sum(FactSalesLine.tonnes).label("tonnes"),
               func.max(FactSalesLine.salesperson).label("salesperson")]
        if multi:
            grp.append(FactSalesLine.company_no)
            sel.append(FactSalesLine.company_no)

        return select(*sel).where(and_(*w)).group_by(*grp)

    recent_map: dict[tuple, float] = {}
    for r in db.execute(build_period(recent_start, recent_end)).fetchall():
        k = (getattr(r, "company_no", "all"), r.customer_code, r.item_group_code)
        recent_map[k] = (r.customer_name, r.item_group_name, float(r.tonnes or 0), r.salesperson)

    prior_map: dict[tuple, float] = {}
    for r in db.execute(build_period(prior_start, prior_end)).fetchall():
        k = (getattr(r, "company_no", "all"), r.customer_code, r.item_group_code)
        prior_map[k] = float(r.tonnes or 0)

    results = []
    for k, (cname, igname, recent_t, sp) in recent_map.items():
        company_no, ccode, igcode = k
        prior_t = prior_map.get(k, 0)
        gap = recent_t - prior_t
        gap_pct = ((gap / prior_t) * 100) if prior_t > 0 else 0
        results.append({
            "company_no": company_no if multi else None,
            "customer_name": cname or ccode,
            "customer_code": ccode,
            "product_group_name": igname or igcode,
            "recent_2m_tonnes": round(recent_t, 2),
            "prior_2m_tonnes": round(prior_t, 2),
            "tonnage_gap": round(gap, 2),
            "gap_pct": round(gap_pct, 1),
            "last_salesperson": sp,
            "status": "declining" if gap < -0.5 else ("new/recovering" if prior_t == 0 else "stable"),
        })

    # Also add customers who bought before but not recently (pure dropouts)
    for k, prior_t in prior_map.items():
        if k not in recent_map:
            company_no, ccode, igcode = k
            results.append({
                "company_no": company_no if multi else None,
                "customer_name": ccode,
                "customer_code": ccode,
                "product_group_name": igcode,
                "recent_2m_tonnes": 0,
                "prior_2m_tonnes": round(prior_t, 2),
                "tonnage_gap": round(-prior_t, 2),
                "gap_pct": -100.0,
                "last_salesperson": None,
                "status": "stopped",
            })

    # Sort by biggest decline first (negative gap = worst)
    results.sort(key=lambda x: x["tonnage_gap"])

    return {
        "chart_type": "table",
        "context": (
            f"Recent 2 months ({recent_start} → {recent_end}) vs prior 2 months "
            f"({prior_start} → {prior_end}). Negative gap = buying less."
        ),
        "rows": results[:limit],
    }


# ─── Stock recommendations ─────────────────────────────────────────────────────

def get_stock_recommendations(
    db: Session,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
    location: Optional[str] = None,
    item_group_code: Optional[str] = None,
    limit: int = 30,
) -> dict[str, Any]:
    """Stock vs sales velocity analysis per item."""
    max_dt = _max_date(db, company_nos, sale_scope)
    period_start = max_dt - timedelta(days=90)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)
    multi = _multi_company(company_nos)

    sales_where = [co_clause, FactSalesLine.transaction_date >= period_start,
                   FactSalesLine.transaction_date <= max_dt, FactSalesLine.item_code.isnot(None)]
    if sc_clause is not None:
        sales_where.append(sc_clause)
    if item_group_code:
        sales_where.append(FactSalesLine.item_group_code == item_group_code)

    sales_grp = [FactSalesLine.item_code, FactSalesLine.item_group_code, FactSalesLine.item_group_name]
    sales_sel = [FactSalesLine.item_code, FactSalesLine.item_group_code, FactSalesLine.item_group_name,
                 func.sum(FactSalesLine.tonnes).label("tonnes_90d")]
    if multi:
        sales_grp.append(FactSalesLine.company_no)
        sales_sel.append(FactSalesLine.company_no)

    sales_rows = {
        (getattr(r, "company_no", "all"), r.item_code): r
        for r in db.execute(
            select(*sales_sel).where(and_(*sales_where))
            .group_by(*sales_grp).order_by(func.sum(FactSalesLine.tonnes).desc())
        ).fetchall()
    }

    stock_where = []
    companies = _valid_companies(company_nos)
    stock_where.append(ItemStockStatus.company_no.in_(companies))
    if location:
        stock_where.append(ItemStockStatus.location == location)
    if item_group_code:
        stock_where.append(ItemStockStatus.item_group_code == item_group_code)

    stock_grp = [ItemStockStatus.art_code, ItemStockStatus.item_name,
                 ItemStockStatus.item_group_code, ItemStockStatus.item_group_name,
                 ItemStockStatus.company_no]
    stock_rows = {
        (r.company_no, r.art_code): r
        for r in db.execute(
            select(ItemStockStatus.company_no, ItemStockStatus.art_code,
                   ItemStockStatus.item_name, ItemStockStatus.item_group_code,
                   ItemStockStatus.item_group_name,
                   func.sum(ItemStockStatus.instock).label("total_instock"),
                   func.sum(ItemStockStatus.po_qty).label("total_po_qty"),
                   func.sum(ItemStockStatus.ord_out).label("total_ord_out"))
            .where(and_(*stock_where) if stock_where else True)
            .group_by(*stock_grp)
        ).fetchall()
    }

    results = []
    for (company_no, item_code), sales in sales_rows.items():
        stock = stock_rows.get((company_no, item_code))
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
            "company_no": company_no if multi else None,
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
        "context": f"90-day sales velocity ending {max_dt}. Months of cover = stock ÷ monthly velocity.",
        "rows": results[:limit],
    }


# ─── Month-over-month comparison ───────────────────────────────────────────────

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
    """Compare current month vs previous month by dimension."""

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)
    multi = _multi_company(company_nos)

    max_date = db.execute(
        select(func.max(FactSalesLine.transaction_date)).where(co_clause)
    ).scalar()

    if not max_date:
        return {"rows": [], "chart_type": "bar"}

    cur_start = date(max_date.year, max_date.month, 1)
    cur_end = max_date
    prev_start = (cur_start - timedelta(days=1)).replace(day=1)
    prev_end = cur_start - timedelta(days=1)

    def build_q(start, end):
        w = [co_clause, FactSalesLine.transaction_date >= start, FactSalesLine.transaction_date <= end]
        if sc_clause is not None:
            w.append(sc_clause)
        if location:
            w.append(FactSalesLine.location == location)
        if item_group_code:
            w.append(FactSalesLine.item_group_code == item_group_code)
        if salesperson:
            w.append(FactSalesLine.salesperson == salesperson)
        if customer_code:
            w.append(FactSalesLine.customer_code == customer_code)

        if dimension == "total" and not multi:
            return select(func.sum(FactSalesLine.tonnes).label("tonnes")).where(and_(*w))

        # Breakdown by dimension and/or company
        grp, sel = [], [func.sum(FactSalesLine.tonnes).label("tonnes")]
        if multi:
            grp.append(FactSalesLine.company_no)
            sel.append(FactSalesLine.company_no)
        if dimension == "item_group":
            grp += [FactSalesLine.item_group_code, FactSalesLine.item_group_name]
            sel += [FactSalesLine.item_group_code, FactSalesLine.item_group_name]
        elif dimension == "salesperson":
            grp.append(FactSalesLine.salesperson)
            sel.append(FactSalesLine.salesperson)
        elif dimension == "location":
            grp.append(FactSalesLine.location)
            sel.append(FactSalesLine.location)

        return select(*sel).where(and_(*w)).group_by(*grp)

    cur_rows = db.execute(build_q(cur_start, cur_end)).fetchall()
    prev_rows = db.execute(build_q(prev_start, prev_end)).fetchall()

    if dimension == "total" and not multi:
        cur_t = float((cur_rows[0].tonnes if cur_rows else 0) or 0)
        prev_t = float((prev_rows[0].tonnes if prev_rows else 0) or 0)
        growth = ((cur_t - prev_t) / prev_t * 100) if prev_t > 0 else 0
        return {
            "chart_type": "bar",
            "rows": [
                {"month": cur_start.strftime("%b %Y"), "label": "Current", "tonnes": cur_t},
                {"month": prev_start.strftime("%b %Y"), "label": "Previous", "tonnes": prev_t},
            ],
            "comparison": {
                "current_month": cur_start.strftime("%B %Y"),
                "current_tonnes": cur_t,
                "previous_month": prev_start.strftime("%B %Y"),
                "previous_tonnes": prev_t,
                "difference": round(cur_t - prev_t, 2),
                "growth_pct": round(growth, 1),
            },
        }

    # Build lookup maps for dimension breakdown
    def key(r):
        parts = []
        if multi:
            parts.append(getattr(r, "company_no", ""))
        if dimension == "item_group":
            parts.append(getattr(r, "item_group_code", "") or "")
        elif dimension == "salesperson":
            parts.append(getattr(r, "salesperson", "") or "")
        elif dimension == "location":
            parts.append(getattr(r, "location", "") or "")
        return tuple(parts)

    prev_map = {key(r): float(r.tonnes or 0) for r in prev_rows}
    results = []
    for r in cur_rows:
        cur_t = float(r.tonnes or 0)
        prev_t = prev_map.get(key(r), 0)
        growth = ((cur_t - prev_t) / prev_t * 100) if prev_t > 0 else 0
        label_parts = []
        if multi:
            label_parts.append(f"Co.{getattr(r, 'company_no', '')}")
        if dimension == "item_group":
            label_parts.append(getattr(r, "item_group_name", None) or getattr(r, "item_group_code", "") or "")
        elif dimension == "salesperson":
            label_parts.append(getattr(r, "salesperson", "") or "")
        elif dimension == "location":
            label_parts.append(getattr(r, "location", "") or "")
        results.append({
            "label": " / ".join(label_parts) if label_parts else "Total",
            "company_no": getattr(r, "company_no", None) if multi else None,
            "current_tonnes": round(cur_t, 2),
            "previous_tonnes": round(prev_t, 2),
            "growth_pct": round(growth, 1),
        })
    results.sort(key=lambda x: x["current_tonnes"], reverse=True)

    return {
        "chart_type": "bar",
        "current_month": cur_start.strftime("%B %Y"),
        "previous_month": prev_start.strftime("%B %Y"),
        "rows": results,
    }


# ─── Sales by company (division comparison) ────────────────────────────────────

def get_sales_by_company(
    db: Session,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    item_group_code: Optional[str] = None,
    salesperson: Optional[str] = None,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
) -> dict[str, Any]:
    """Compare sales across all active divisions/companies."""
    all_cos = _valid_companies(company_nos)
    co_clause = FactSalesLine.company_no.in_(all_cos)
    sc_clause = _scope_clause(sale_scope)

    if not date_to:
        date_to = _max_date(db, company_nos, sale_scope)
    if not date_from:
        date_from = date_to - timedelta(days=180)

    base_where = [co_clause, FactSalesLine.transaction_date >= date_from,
                  FactSalesLine.transaction_date <= date_to]
    if sc_clause is not None:
        base_where.append(sc_clause)
    if item_group_code:
        base_where.append(FactSalesLine.item_group_code == item_group_code)
    if salesperson:
        base_where.append(FactSalesLine.salesperson == salesperson)

    from app.services.business_context import COMPANY_MAP

    rows = db.execute(
        select(FactSalesLine.company_no, func.sum(FactSalesLine.tonnes).label("tonnes"),
               func.count(func.distinct(FactSalesLine.customer_code)).label("customers"))
        .where(and_(*base_where))
        .group_by(FactSalesLine.company_no)
        .order_by(func.sum(FactSalesLine.tonnes).desc())
    ).fetchall()

    total = sum(float(r.tonnes or 0) for r in rows)
    return {
        "chart_type": "bar",
        "date_range": {"from": str(date_from), "to": str(date_to)},
        "rows": [
            {
                "company_no": r.company_no,
                "division_name": COMPANY_MAP.get(r.company_no, r.company_no),
                "tonnes": float(r.tonnes or 0),
                "share_pct": round(float(r.tonnes or 0) / total * 100, 1) if total else 0,
                "unique_customers": r.customers,
            }
            for r in rows
        ],
    }


# ─── Internal vs external sales ────────────────────────────────────────────────

def get_internal_vs_external_sales(
    db: Session,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    company_nos: Optional[list[str]] = None,
    item_group_code: Optional[str] = None,
) -> dict[str, Any]:
    """Split total sales into internal (inter-company) vs external by month."""
    co_clause = _company_clause(company_nos)
    multi = _multi_company(company_nos)

    if not date_to:
        date_to = _max_date(db, company_nos, "all")
    if not date_from:
        date_from = date_to - timedelta(days=180)

    base_where = [co_clause, FactSalesLine.transaction_date >= date_from,
                  FactSalesLine.transaction_date <= date_to]
    if item_group_code:
        base_where.append(FactSalesLine.item_group_code == item_group_code)

    month_expr = func.date_trunc("month", FactSalesLine.transaction_date)
    int_clause = FactSalesLine.customer_code.in_(list(INTERNAL_CUSTOMER_CODES))
    ext_clause = FactSalesLine.customer_code.notin_(list(INTERNAL_CUSTOMER_CODES))

    def period_q(scope_clause, label: str):
        w = base_where + [scope_clause]
        grp = [month_expr]
        sel = [month_expr.label("period"),
               func.sum(FactSalesLine.tonnes).label("tonnes")]
        if multi:
            grp.append(FactSalesLine.company_no)
            sel.append(FactSalesLine.company_no)
        return [(r, label) for r in db.execute(
            select(*sel).where(and_(*w)).group_by(*grp).order_by(month_expr)
        ).fetchall()]

    internal_rows = period_q(int_clause, "Internal")
    external_rows = period_q(ext_clause, "External")

    # Totals
    def total_q(scope_clause):
        grp = []
        sel = [func.sum(FactSalesLine.tonnes).label("tonnes")]
        if multi:
            grp.append(FactSalesLine.company_no)
            sel.append(FactSalesLine.company_no)
        w = base_where + [scope_clause]
        return db.execute(select(*sel).where(and_(*w)).group_by(*grp) if multi else
                          select(*sel).where(and_(*w))).fetchall()

    int_total = sum(float(r.tonnes or 0) for r in total_q(int_clause))
    ext_total = sum(float(r.tonnes or 0) for r in total_q(ext_clause))
    grand_total = int_total + ext_total

    return {
        "chart_type": "line",
        "date_range": {"from": str(date_from), "to": str(date_to)},
        "summary": {
            "total_tonnes": round(grand_total, 2),
            "external_tonnes": round(ext_total, 2),
            "internal_tonnes": round(int_total, 2),
            "external_pct": round(ext_total / grand_total * 100, 1) if grand_total else 0,
            "internal_pct": round(int_total / grand_total * 100, 1) if grand_total else 0,
        },
        "monthly_rows": [
            {
                "period": str(r.period)[:7],
                "scope": label,
                "company_no": getattr(r, "company_no", None) if multi else None,
                "tonnes": float(r.tonnes or 0),
            }
            for r, label in (internal_rows + external_rows)
        ],
    }


# ─── Month-end projection ──────────────────────────────────────────────────────

def project_month_end_sales(
    db: Session,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
    item_group_code: Optional[str] = None,
    salesperson: Optional[str] = None,
) -> dict[str, Any]:
    """Project current month end tonnage based on MTD run rate.
    Also compares: same period last month, 3-month average, same period last year."""
    import calendar

    max_dt = _max_date(db, company_nos, sale_scope)
    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)

    cur_start = date(max_dt.year, max_dt.month, 1)
    days_elapsed = (max_dt - cur_start).days + 1
    days_in_month = calendar.monthrange(max_dt.year, max_dt.month)[1]

    # Previous month
    prev_end = cur_start - timedelta(days=1)
    prev_start = date(prev_end.year, prev_end.month, 1)
    prev_same_end = prev_start + timedelta(days=days_elapsed - 1)
    days_in_prev_month = calendar.monthrange(prev_end.year, prev_end.month)[1]

    # 3 months ago for average
    three_mo_start = (prev_start.replace(day=1) - timedelta(days=1)).replace(day=1)
    three_mo_start = (three_mo_start.replace(day=1) - timedelta(days=1)).replace(day=1)

    def query_range(start, end):
        w = [co_clause, FactSalesLine.transaction_date >= start,
             FactSalesLine.transaction_date <= end]
        if sc_clause is not None:
            w.append(sc_clause)
        if item_group_code:
            w.append(FactSalesLine.item_group_code == item_group_code)
        if salesperson:
            w.append(FactSalesLine.salesperson == salesperson)
        r = db.execute(select(func.sum(FactSalesLine.tonnes)).where(and_(*w))).scalar()
        return float(r or 0)

    mtd_tonnes = query_range(cur_start, max_dt)
    prev_same_period = query_range(prev_start, prev_same_end)
    prev_full_month = query_range(prev_start, prev_end)
    three_month_total = query_range(three_mo_start, prev_end)

    daily_rate = mtd_tonnes / days_elapsed if days_elapsed > 0 else 0
    projected_eom = daily_rate * days_in_month

    avg_3m_monthly = three_month_total / 3 if three_month_total > 0 else 0

    pct_vs_prev_same = ((mtd_tonnes - prev_same_period) / prev_same_period * 100
                        if prev_same_period > 0 else 0)
    pct_vs_prev_full = ((projected_eom - prev_full_month) / prev_full_month * 100
                        if prev_full_month > 0 else 0)

    warnings = []
    if days_elapsed < 5:
        warnings.append("Only a few days of current-month data — projection may be unreliable.")
    if days_elapsed == days_in_month:
        warnings.append("Month is complete — projection equals actual.")

    return {
        "chart_type": "bar",
        "reference_date": str(max_dt),
        "current_month": cur_start.strftime("%B %Y"),
        "days_elapsed": days_elapsed,
        "days_in_month": days_in_month,
        "completion_pct": round(days_elapsed / days_in_month * 100, 1),
        "mtd_tonnes": round(mtd_tonnes, 2),
        "daily_run_rate": round(daily_rate, 2),
        "projected_eom_tonnes": round(projected_eom, 2),
        "previous_month": prev_start.strftime("%B %Y"),
        "prev_same_period_tonnes": round(prev_same_period, 2),
        "prev_full_month_tonnes": round(prev_full_month, 2),
        "avg_3m_monthly_tonnes": round(avg_3m_monthly, 2),
        "pct_vs_prev_same_period": round(pct_vs_prev_same, 1),
        "pct_projected_vs_prev_full": round(pct_vs_prev_full, 1),
        "warnings": warnings,
    }


# ─── Fast movers ───────────────────────────────────────────────────────────────

def get_fast_movers(
    db: Session,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
    item_group_code: Optional[str] = None,
    location: Optional[str] = None,
    limit: int = 20,
) -> dict[str, Any]:
    """Items with highest recent sales velocity and strongest growth vs prior period.
    'Fast mover' = high recent 3-month tonnes + positive growth trend."""
    max_dt = _max_date(db, company_nos, sale_scope)
    recent_end = max_dt
    recent_start = max_dt - timedelta(days=89)
    prior_end = recent_start - timedelta(days=1)
    prior_start = prior_end - timedelta(days=89)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)
    multi = _multi_company(company_nos)

    def period_q(start, end):
        w = [co_clause, FactSalesLine.transaction_date >= start,
             FactSalesLine.transaction_date <= end,
             FactSalesLine.item_code.isnot(None)]
        if sc_clause is not None:
            w.append(sc_clause)
        if item_group_code:
            w.append(FactSalesLine.item_group_code == item_group_code)
        if location:
            w.append(FactSalesLine.location == location)
        grp = [FactSalesLine.item_code, FactSalesLine.item_group_code,
               FactSalesLine.item_group_name]
        sel = [FactSalesLine.item_code, FactSalesLine.item_group_code,
               FactSalesLine.item_group_name,
               func.sum(FactSalesLine.tonnes).label("tonnes"),
               func.max(FactSalesLine.transaction_date).label("last_sale")]
        if multi:
            grp.append(FactSalesLine.company_no)
            sel.append(FactSalesLine.company_no)
        return {
            (getattr(r, "company_no", "all"), r.item_code): r
            for r in db.execute(select(*sel).where(and_(*w)).group_by(*grp)).fetchall()
        }

    recent_map = period_q(recent_start, recent_end)
    prior_map = period_q(prior_start, prior_end)

    results = []
    for (co, code), rec in recent_map.items():
        recent_t = float(rec.tonnes or 0)
        prior_t = float((prior_map.get((co, code)) or type("x", (), {"tonnes": 0})()).tonnes or 0)
        growth = ((recent_t - prior_t) / prior_t * 100) if prior_t > 0 else (100 if recent_t > 0 else 0)
        results.append({
            "company_no": co if multi else None,
            "item_code": code,
            "item_group_name": rec.item_group_name or rec.item_group_code or "Unknown",
            "recent_3m_tonnes": round(recent_t, 2),
            "prior_3m_tonnes": round(prior_t, 2),
            "growth_pct": round(growth, 1),
            "last_sale_date": str(rec.last_sale) if rec.last_sale else None,
            "trend": "growing" if growth > 5 else ("stable" if growth >= -5 else "declining"),
        })

    results.sort(key=lambda x: x["recent_3m_tonnes"], reverse=True)
    return {
        "chart_type": "bar",
        "context": f"Items ranked by recent 3-month volume ({recent_start} → {recent_end}) with growth vs prior period.",
        "rows": [r for r in results if r["trend"] in ("growing", "stable")][:limit],
    }


# ─── Slow movers ───────────────────────────────────────────────────────────────

def get_slow_movers(
    db: Session,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
    item_group_code: Optional[str] = None,
    days_slow: int = 60,
    limit: int = 30,
) -> dict[str, Any]:
    """Items with little or no recent sales activity.
    'Slow mover' = no sale in the last N days despite having sold before."""
    max_dt = _max_date(db, company_nos, sale_scope)
    slow_cutoff = max_dt - timedelta(days=days_slow)
    lookback_start = max_dt - timedelta(days=365)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)
    multi = _multi_company(company_nos)

    base_where = [co_clause, FactSalesLine.transaction_date >= lookback_start,
                  FactSalesLine.item_code.isnot(None)]
    if sc_clause is not None:
        base_where.append(sc_clause)
    if item_group_code:
        base_where.append(FactSalesLine.item_group_code == item_group_code)

    grp = [FactSalesLine.item_code, FactSalesLine.item_group_code, FactSalesLine.item_group_name]
    sel = [FactSalesLine.item_code, FactSalesLine.item_group_code, FactSalesLine.item_group_name,
           func.sum(FactSalesLine.tonnes).label("total_tonnes"),
           func.max(FactSalesLine.transaction_date).label("last_sale")]
    if multi:
        grp.append(FactSalesLine.company_no)
        sel.append(FactSalesLine.company_no)

    rows = db.execute(
        select(*sel).where(and_(*base_where)).group_by(*grp)
        .having(func.max(FactSalesLine.transaction_date) < slow_cutoff)
        .order_by(func.sum(FactSalesLine.tonnes).desc())
        .limit(limit)
    ).fetchall()

    return {
        "chart_type": "table",
        "context": f"Items with no sale in the last {days_slow} days (as of {max_dt}) but with prior history.",
        "reference_date": str(max_dt),
        "rows": [
            {
                "company_no": getattr(r, "company_no", None) if multi else None,
                "item_code": r.item_code,
                "item_group_name": r.item_group_name or r.item_group_code or "Unknown",
                "tonnes_12m": round(float(r.total_tonnes or 0), 2),
                "last_sale_date": str(r.last_sale) if r.last_sale else None,
                "days_since_sale": (max_dt - r.last_sale).days if r.last_sale else None,
                "status": "Dead Stock" if (max_dt - r.last_sale).days > 180 else "Slow Mover"
                if r.last_sale else "No Recent Sale",
            }
            for r in rows
        ],
    }


# ─── Products to push ──────────────────────────────────────────────────────────

def identify_products_to_push(
    db: Session,
    company_nos: Optional[list[str]] = None,
    sale_scope: str = "all",
    location: Optional[str] = None,
    limit: int = 20,
) -> dict[str, Any]:
    """Identify product groups that sales should focus on: growing demand + adequate stock.
    Also flags high-demand groups with low stock."""
    max_dt = _max_date(db, company_nos, sale_scope)
    recent_end = max_dt
    recent_start = max_dt - timedelta(days=89)
    prior_end = recent_start - timedelta(days=1)
    prior_start = prior_end - timedelta(days=89)

    co_clause = _company_clause(company_nos)
    sc_clause = _scope_clause(sale_scope)
    multi = _multi_company(company_nos)
    companies = _valid_companies(company_nos)

    def sales_q(start, end):
        w = [co_clause, FactSalesLine.transaction_date >= start,
             FactSalesLine.transaction_date <= end,
             FactSalesLine.item_group_code.isnot(None)]
        if sc_clause is not None:
            w.append(sc_clause)
        grp = [FactSalesLine.item_group_code, FactSalesLine.item_group_name]
        sel = [FactSalesLine.item_group_code, FactSalesLine.item_group_name,
               func.sum(FactSalesLine.tonnes).label("tonnes")]
        if multi:
            grp.append(FactSalesLine.company_no)
            sel.append(FactSalesLine.company_no)
        return {
            (getattr(r, "company_no", "all"), r.item_group_code): (r.item_group_name, float(r.tonnes or 0))
            for r in db.execute(select(*sel).where(and_(*w)).group_by(*grp)).fetchall()
        }

    # Stock by item group
    stock_q = db.execute(
        select(ItemStockStatus.company_no, ItemStockStatus.item_group_code,
               func.sum(ItemStockStatus.instock).label("instock"))
        .where(ItemStockStatus.company_no.in_(companies))
        .group_by(ItemStockStatus.company_no, ItemStockStatus.item_group_code)
    ).fetchall()
    stock_map = {(r.company_no, r.item_group_code): float(r.instock or 0) for r in stock_q}

    recent_map = sales_q(recent_start, recent_end)
    prior_map = sales_q(prior_start, prior_end)

    all_keys = set(recent_map.keys()) | set(prior_map.keys())
    results = []
    for key in all_keys:
        co, code = key
        name, recent_t = recent_map.get(key, (code, 0))
        _, prior_t = prior_map.get(key, (code, 0))
        instock = stock_map.get((co, code) if multi else (co, code), 0)
        monthly_vel = recent_t / 3 if recent_t > 0 else 0
        months_cover = (instock / monthly_vel) if monthly_vel > 0 else 99
        growth = ((recent_t - prior_t) / prior_t * 100) if prior_t > 0 else 0

        push_score = 0
        push_reason = []
        if growth > 10:
            push_score += 2
            push_reason.append(f"demand growing +{round(growth, 1)}%")
        if months_cover < 2 and monthly_vel > 0:
            push_score += 2
            push_reason.append(f"stock low ({round(months_cover, 1)} months cover)")
        if prior_t > 0 and recent_t < prior_t * 0.8:
            push_score += 1
            push_reason.append(f"sales dropped {round(100 - recent_t/prior_t*100, 1)}% — opportunity to recover")

        if push_score > 0 or monthly_vel > 10:
            results.append({
                "company_no": co if multi else None,
                "item_group_code": code,
                "item_group_name": name or code,
                "recent_3m_tonnes": round(recent_t, 2),
                "prior_3m_tonnes": round(prior_t, 2),
                "growth_pct": round(growth, 1),
                "monthly_velocity": round(monthly_vel, 2),
                "months_of_stock": round(months_cover, 1) if months_cover < 99 else None,
                "push_score": push_score,
                "recommendation": "; ".join(push_reason) if push_reason else "High volume group",
            })

    results.sort(key=lambda x: (-x["push_score"], -x["recent_3m_tonnes"]))
    return {
        "chart_type": "table",
        "context": f"Products sales team should focus on — based on demand trends and stock position as of {max_dt}.",
        "rows": results[:limit],
    }
