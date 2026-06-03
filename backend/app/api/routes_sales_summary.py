from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db

router = APIRouter(prefix="/api/sales-summary", tags=["Sales Summary"])

ACTIVE_COMPANIES = ("3", "4", "5", "6")


def _company_filter(company_no: str, col: str = "company_no") -> tuple[str, dict]:
    """Return (SQL fragment, extra params) for a company_no filter."""
    if company_no == "all":
        return f"{col} IN ('3','4','5','6')", {}
    return f"{col} = :company_no", {"company_no": company_no}


@router.get("")
def get_sales_summary(
    company_no: str | None = Query(default=None),
    date_from: date = Query(default=date(2024, 1, 1)),
    date_to: date = Query(default=date(2026, 12, 31)),
    db: Session = Depends(get_db),
):
    if company_no is None:
        company_no = settings.hansa_company_no

    co_frag, co_params = _company_filter(company_no)
    base_params = {**co_params, "date_from": date_from, "date_to": date_to}

    monthly_rows = db.execute(text(f"""
        SELECT
            date_trunc('month', transaction_date)::date AS month_start,
            extract(year  FROM transaction_date)::int   AS year,
            extract(month FROM transaction_date)::int   AS month,
            SUM(tonnes)::float                          AS total_tonnes
        FROM fact_sales_lines
        WHERE {co_frag}
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
          AND transaction_date >= :date_from
          AND transaction_date <= :date_to
        GROUP BY salesperson
        ORDER BY total_tonnes DESC
    """), base_params).mappings().all()

    division_breakdown = []
    if company_no == "all":
        div_rows = db.execute(text("""
            SELECT
                company_no,
                SUM(tonnes)::float AS total_tonnes
            FROM fact_sales_lines
            WHERE company_no IN ('3','4','5','6')
              AND transaction_date >= :date_from
              AND transaction_date <= :date_to
            GROUP BY company_no
            ORDER BY total_tonnes DESC
        """), {"date_from": date_from, "date_to": date_to}).mappings().all()

        labels = {"3": "Retail", "4": "Manufacturing", "5": "Engineering", "6": "Mining"}
        division_breakdown = [
            {
                "company_no": r["company_no"],
                "label": labels.get(r["company_no"], r["company_no"]),
                "total_tonnes": float(r["total_tonnes"] or 0),
            }
            for r in div_rows
        ]

    return {
        "company_no": company_no,
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
