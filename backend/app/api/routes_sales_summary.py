from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.filters import build_company_filter, build_scope_sql
from app.db.database import get_db

router = APIRouter(prefix="/api/sales-summary", tags=["Sales Summary"])

COMPANY_LABELS = {"3": "Retail", "4": "Manufacturing", "5": "Engineering", "6": "Mining"}


@router.get("")
def get_sales_summary(
    company_nos: Optional[list[str]] = Query(default=None),
    company_no: Optional[str] = Query(default=None),
    sale_scope: str = Query(default="all"),
    date_from: date = Query(default=date(2024, 1, 1)),
    date_to: date = Query(default=date(2026, 12, 31)),
    db: Session = Depends(get_db),
):
    resolved = company_nos or ([company_no] if company_no else None) or [settings.hansa_company_no]
    co_frag, co_params = build_company_filter(resolved)
    scope_frag = build_scope_sql(sale_scope)
    base_params = {**co_params, "date_from": date_from, "date_to": date_to}

    monthly_rows = db.execute(text(f"""
        SELECT
            date_trunc('month', transaction_date)::date AS month_start,
            extract(year  FROM transaction_date)::int   AS year,
            extract(month FROM transaction_date)::int   AS month,
            SUM(tonnes)::float                          AS total_tonnes
        FROM fact_sales_lines
        WHERE {co_frag}
          {scope_frag}
          AND transaction_date >= :date_from
          AND transaction_date <= :date_to
        GROUP BY month_start, year, month
        ORDER BY year, month
    """), base_params).mappings().all()

    rep_rows = db.execute(text(f"""
        SELECT
            COALESCE(NULLIF(TRIM(salesperson), ''), 'Unassigned') AS salesperson,
            SUM(tonnes)::float AS total_tonnes
        FROM fact_sales_lines
        WHERE {co_frag}
          {scope_frag}
          AND transaction_date >= :date_from
          AND transaction_date <= :date_to
        GROUP BY salesperson
        ORDER BY total_tonnes DESC
    """), base_params).mappings().all()

    is_multi = not resolved or "all" in resolved or len([c for c in resolved if c in ("3", "4", "5", "6")]) > 1
    division_breakdown = []
    if is_multi:
        div_rows = db.execute(text(f"""
            SELECT
                company_no,
                SUM(tonnes)::float AS total_tonnes
            FROM fact_sales_lines
            WHERE company_no IN ('3','4','5','6')
              {scope_frag}
              AND transaction_date >= :date_from
              AND transaction_date <= :date_to
            GROUP BY company_no
            ORDER BY total_tonnes DESC
        """), {"date_from": date_from, "date_to": date_to}).mappings().all()

        division_breakdown = [
            {
                "company_no": r["company_no"],
                "label": COMPANY_LABELS.get(r["company_no"], r["company_no"]),
                "total_tonnes": float(r["total_tonnes"] or 0),
            }
            for r in div_rows
        ]

    return {
        "company_no": ",".join(resolved) if resolved else "all",
        "company_nos": resolved,
        "sale_scope": sale_scope,
        "date_from": date_from,
        "date_to": date_to,
        "monthly_sales": [
            {
                "month_start": row["month_start"].isoformat(),
                "year": row["year"],
                "month": int(row["month"]),
                "total_tonnes": float(row["total_tonnes"] or 0),
            }
            for row in monthly_rows
        ],
        "rep_contribution": [
            {
                "salesperson": row["salesperson"],
                "total_tonnes": float(row["total_tonnes"] or 0),
            }
            for row in rep_rows
        ],
        "division_breakdown": division_breakdown,
    }
