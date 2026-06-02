from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db

router = APIRouter(prefix="/api/sales-summary", tags=["Sales Summary"])


@router.get("")
def get_sales_summary(
    company_no: str | None = Query(default=None),
    date_from: date = Query(default=date(2025, 1, 1)),
    date_to: date = Query(default=date(2026, 12, 31)),
    db: Session = Depends(get_db),
):
    if company_no is None:
        company_no = settings.hansa_company_no

    monthly_query = text(
        """
        WITH base AS (
            SELECT
                transaction_date,
                tonnes,
                salesperson
            FROM fact_sales_lines
            WHERE company_no = :company_no
              AND transaction_date >= :date_from
              AND transaction_date <= :date_to
        )

        SELECT
            date_trunc('month', transaction_date)::date AS month_start,
            extract(year FROM transaction_date)::int AS year,
            extract(month FROM transaction_date)::int AS month,
            SUM(tonnes)::float AS total_tonnes
        FROM base
        GROUP BY month_start, year, month
        ORDER BY year, month
        """
    )

    rep_query = text(
        """
        WITH base AS (
            SELECT
                transaction_date,
                tonnes,
                salesperson
            FROM fact_sales_lines
            WHERE company_no = :company_no
              AND transaction_date >= :date_from
              AND transaction_date <= :date_to
        )

        SELECT
            COALESCE(NULLIF(TRIM(salesperson), ''), 'Unknown') AS salesperson,
            SUM(tonnes)::float AS total_tonnes
        FROM base
        GROUP BY salesperson
        ORDER BY total_tonnes DESC
        """
    )

    monthly_rows = db.execute(
        monthly_query,
        {
            "company_no": company_no,
            "date_from": date_from,
            "date_to": date_to,
        },
    ).mappings().all()

    rep_rows = db.execute(
        rep_query,
        {
            "company_no": company_no,
            "date_from": date_from,
            "date_to": date_to,
        },
    ).mappings().all()

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
    }
