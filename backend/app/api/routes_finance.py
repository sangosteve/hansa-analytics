"""
Finance & P&L analytics endpoints.

Revenue is sourced from confirmed sales invoices (hansa_invoice_headers.base_sum4).
Cost of Sales, OPEX, Gross Profit and Net Profit are computed from GL transaction
lines (hansa_gl_transactions) once that data has been synced via the refresh pipeline
(include_gl_transactions toggle in Settings).

P&L account mappings — exact Power BI formula definitions:

  Revenue (from invoices):
    OK invoices, base_sum4 sum

  Cost of Sales (GL, SUM DebVal − CredVal):
    AccNumber 20000–21035
    AccNumber 45850–45910
    AccNumber 47030–47060
    AccNumber 48000
    AccNumber 48025–48040
    AccNumber 40080
    AccNumber 48201–48210

  OPEX (GL, ABS(SUM DebVal − CredVal)):
    AccType = 4  AND  AccNumber 40000–43999
    (joined with gl_accounts on acc_number where company_no = '1')
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


# ── Revenue: from confirmed invoices ─────────────────────────────────────────

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


# ── GL availability check ─────────────────────────────────────────────────────

_GL_AVAILABILITY_SQL = """
    SELECT COUNT(*) AS cnt
    FROM hansa_gl_transactions
    WHERE {co_frag}
      AND trans_date >= :date_from
      AND trans_date <= :date_to
"""


# ── Cost of Sales: exact Power BI account ranges ──────────────────────────────
# SUM(DebVal) - SUM(CredVal) for accounts:
#   20000–21035, 45850–45910, 47030–47060, 48000,
#   48025–48040, 40080, 48201–48210

_COS_SQL = """
    SELECT COALESCE(
        SUM(COALESCE(t.deb_val, 0)) - SUM(COALESCE(t.cred_val, 0)),
        0
    )::float AS cos
    FROM hansa_gl_transactions t
    WHERE {co_frag}
      AND t.trans_date >= :date_from
      AND t.trans_date <= :date_to
      AND t.acc_number ~ '^[0-9]+$'
      AND (
           (t.acc_number::integer BETWEEN 20000 AND 21035)
        OR (t.acc_number::integer BETWEEN 45850 AND 45910)
        OR (t.acc_number::integer BETWEEN 47030 AND 47060)
        OR  t.acc_number::integer = 48000
        OR (t.acc_number::integer BETWEEN 48025 AND 48040)
        OR  t.acc_number::integer = 40080
        OR (t.acc_number::integer BETWEEN 48201 AND 48210)
      )
"""


# ── OPEX: AccType = 4 AND AccNumber 40000–43999 ───────────────────────────────
# ABS(SUM(DebVal) - SUM(CredVal))
# Requires a JOIN with gl_accounts (master company = '1') to get AccType.

_OPEX_SQL = """
    SELECT ABS(COALESCE(
        SUM(COALESCE(t.deb_val, 0)) - SUM(COALESCE(t.cred_val, 0)),
        0
    ))::float AS opex
    FROM hansa_gl_transactions t
    JOIN gl_accounts a
      ON a.acc_number = t.acc_number
     AND a.company_no = '1'
    WHERE {co_frag}
      AND t.trans_date >= :date_from
      AND t.trans_date <= :date_to
      AND t.acc_number ~ '^[0-9]+$'
      AND a.acc_type = 4
      AND t.acc_number::integer >= 40000
      AND t.acc_number::integer < 44000
"""


# ── Endpoint ──────────────────────────────────────────────────────────────────

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

    # Company filter for invoice table (unaliased)
    co_frag_inv, co_params = build_company_filter(resolved)
    # Company filter for GL transaction table (aliased to 't')
    co_frag_gl, _ = build_company_filter(resolved, col="t.company_no")

    params = {**co_params, "date_from": date_from, "date_to": date_to}

    # ── Revenue from invoices ─────────────────────────────────────────────────
    rev_row = db.execute(text(_revenue_sql(co_frag_inv)), params).mappings().first()
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
        ly_row = db.execute(text(_revenue_sql(co_frag_inv)), ly_params).mappings().first()
        revenue_ly = float(ly_row["revenue"] or 0) if ly_row else 0.0

    revenue_yoy = (
        round((revenue - revenue_ly) / revenue_ly * 100, 1) if revenue_ly else None
    )

    # ── Check whether GL transaction data has been synced ────────────────────
    # If no rows exist for these companies in the requested date window,
    # CoS and OPEX are returned as null so the UI can show "awaiting GL sync".
    # Use the unaliased fragment — no JOIN in this query.
    avail_sql = _GL_AVAILABILITY_SQL.format(co_frag=co_frag_inv)
    avail_row = db.execute(text(avail_sql), params).mappings().first()
    gl_data_available = bool(avail_row and (avail_row["cnt"] or 0) > 0)

    cost_of_sales: Optional[float] = None
    opex: Optional[float] = None

    if gl_data_available:
        # ── Cost of Sales ─────────────────────────────────────────────────────
        cos_sql = _COS_SQL.format(co_frag=co_frag_gl)
        cos_row = db.execute(text(cos_sql), params).mappings().first()
        cost_of_sales = float(cos_row["cos"] or 0) if cos_row else 0.0

        # ── OPEX ──────────────────────────────────────────────────────────────
        opex_sql = _OPEX_SQL.format(co_frag=co_frag_gl)
        opex_row = db.execute(text(opex_sql), params).mappings().first()
        opex = float(opex_row["opex"] or 0) if opex_row else 0.0

    # ── Derived P&L lines ─────────────────────────────────────────────────────
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
        "gl_data_available": gl_data_available,
        "revenue": revenue,
        "revenue_ly": revenue_ly,
        "revenue_yoy_pct": revenue_yoy,
        "invoice_count": invoice_count,
        "cost_of_sales": cost_of_sales,
        "gross_profit": gross_profit,
        "opex": opex,
        "net_profit": net_profit,
    }
