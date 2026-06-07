"""
Finance & P&L analytics endpoints.

Revenue is sourced from confirmed sales invoices (hansa_invoice_headers.base_sum4).
Cost of Sales and OPEX derive from GL account ranges and require GL voucher
data (GlVc) to be synced — those fields return null until available.

P&L account mappings (from Income Statement report definition):
  Revenue       : 10000–10585
  Cost of Sales : 20000–21035, 45850–45910, 47030–47060, 48000, 48025–48040,
                  40080, 48201–48210
  OPEX          : all overhead/wage/salary accounts (see Income Statement rows 4–68)
  Other Income  : 30000–39100, 40050, 43100, 44045
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.filters import build_company_filter
from app.db.database import get_db

router = APIRouter(prefix="/api/finance", tags=["Finance"])


def _revenue_sql(co_frag: str) -> str:
    return f"""
        SELECT
            COALESCE(SUM(
                CASE
                    WHEN cred_mark IS NOT NULL AND TRIM(cred_mark) != ''
                    THEN -ABS(COALESCE(base_sum4, 0))
                    ELSE COALESCE(base_sum4, 0)
                END
            ), 0)::float AS revenue,
            COUNT(*) AS invoice_count
        FROM hansa_invoice_headers
        WHERE {co_frag}
          AND ok_flag = 1
          AND inv_date >= :date_from
          AND inv_date <= :date_to
    """


@router.get("/pl-summary")
def get_pl_summary(
    company_nos: Optional[list[str]] = Query(default=None),
    company_no: Optional[str] = Query(default=None),
    date_from: str = Query(...),
    date_to: str = Query(...),
    db: Session = Depends(get_db),
):
    resolved = (
        company_nos
        or ([company_no] if company_no else None)
        or [settings.hansa_company_no]
    )
    co_frag, co_params = build_company_filter(resolved)
    params = {**co_params, "date_from": date_from, "date_to": date_to}

    # ── Revenue: sum of OK invoice amounts in base currency ───────────────────
    rev_row = db.execute(text(_revenue_sql(co_frag)), params).mappings().first()
    revenue = float(rev_row["revenue"] or 0) if rev_row else 0.0
    invoice_count = int(rev_row["invoice_count"] or 0) if rev_row else 0

    # ── Same period last year (YoY comparison) ────────────────────────────────
    try:
        d_from = date.fromisoformat(date_from)
        d_to = date.fromisoformat(date_to)
        ly_from = d_from.replace(year=d_from.year - 1).isoformat()
        ly_to = d_to.replace(year=d_to.year - 1).isoformat()
    except (ValueError, TypeError):
        ly_from = ly_to = None

    revenue_ly = 0.0
    if ly_from and ly_to:
        ly_params = {**co_params, "date_from": ly_from, "date_to": ly_to}
        ly_row = db.execute(text(_revenue_sql(co_frag)), ly_params).mappings().first()
        revenue_ly = float(ly_row["revenue"] or 0) if ly_row else 0.0

    revenue_yoy = (
        round((revenue - revenue_ly) / revenue_ly * 100, 1) if revenue_ly else None
    )

    # ── GL-dependent line items ───────────────────────────────────────────────
    # These require GL voucher (GlVc) data to be synced into a gl_transactions
    # table. Until then they are returned as null and displayed accordingly in
    # the UI.
    #
    # Cost of Sales account ranges:
    #   20000:21035, 45850:45910, 47030:47060, 48000, 48025:48040, 40080, 48201:48210
    #
    # OPEX account ranges (overheads + wages + salaries):
    #   40000–73000 range (see Income Statement report definition rows 4–68)
    cost_of_sales: Optional[float] = None
    opex: Optional[float] = None

    gross_profit: Optional[float] = (
        revenue - cost_of_sales if cost_of_sales is not None else None
    )
    net_profit: Optional[float] = (
        (gross_profit - opex)
        if (gross_profit is not None and opex is not None)
        else None
    )

    return {
        "company_nos": resolved,
        "date_from": date_from,
        "date_to": date_to,
        "gl_data_available": False,
        "revenue": revenue,
        "revenue_ly": revenue_ly,
        "revenue_yoy_pct": revenue_yoy,
        "invoice_count": invoice_count,
        "cost_of_sales": cost_of_sales,
        "gross_profit": gross_profit,
        "opex": opex,
        "net_profit": net_profit,
    }
