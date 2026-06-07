"""
GL transaction source refresh service.

Fetches GL transaction lines from Hansa TRVc register for a given company
and date range, applying a range-reload strategy (delete the period, then
re-insert fresh rows).

Fields from Hansa TRVc:
  Number    — voucher/journal reference number
  TransNr   — globally-unique transaction line number per company
  AccNumber — GL account number (joins with gl_accounts for AccType)
  TransDate — posting date
  RegDate   — registration date
  DebVal    — debit amount in base currency
  CredVal   — credit amount in base currency
  DebVal2   — debit amount in foreign currency
  VATCode   — VAT code (optional)
  Qty       — quantity (optional)
  Curncy    — currency code
  Comment   — line description

P&L formulas (matching the Power BI report definitions):
  Revenue      = ABS(SUM(CredVal) - SUM(DebVal))  WHERE AccType=3 AND AccNumber 10000–10584
  Cost of Sales= SUM(DebVal) - SUM(CredVal)        WHERE AccNumber in CoS ranges
  OPEX         = ABS(SUM(DebVal) - SUM(CredVal))   WHERE AccType=4 AND AccNumber 40000–43999
  Gross Profit = Revenue - Cost of Sales
  Net Profit   = Gross Profit - OPEX
"""

from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models import HansaGlTransaction, RefreshRun
from app.services.hansa_client import HansaClient


# ── Type coercion helpers ─────────────────────────────────────────────────────

def _dec(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _str(value: Any) -> str | None:
    if value is None or value == "":
        return None
    return str(value).strip() or None


def _date(value: Any) -> date | None:
    if value is None or value == "" or value == "0000-00-00":
        return None
    try:
        if isinstance(value, date):
            return value
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


# ── Main sync function ────────────────────────────────────────────────────────

async def refresh_gl_transactions(
    db: Session,
    date_from: date,
    date_to: date,
    company_no: str,
) -> RefreshRun:
    """
    Range-reload GL transactions for the given company and date window.
    Deletes existing rows whose trans_date falls within the window, then
    fetches fresh data from Hansa TRVc and inserts it.
    """
    refresh_run = RefreshRun(
        company_no=company_no,
        refresh_type="gl_transactions",
        status="running",
        date_from=date_from,
        date_to=date_to,
    )
    db.add(refresh_run)
    db.commit()
    db.refresh(refresh_run)

    client = HansaClient(company_no=company_no)

    try:
        rows_raw = await client.get_gl_transactions(
            date_from=date_from.isoformat(),
            date_to=date_to.isoformat(),
        )

        # ── Delete existing rows in this date window for this company ──────────
        db.execute(
            text("""
                DELETE FROM hansa_gl_transactions
                WHERE company_no = :company_no
                  AND trans_date >= :date_from
                  AND trans_date <= :date_to
            """),
            {"company_no": company_no, "date_from": date_from, "date_to": date_to},
        )
        db.flush()

        # ── Build and insert new rows ─────────────────────────────────────────
        rows: list[HansaGlTransaction] = []
        skipped = 0

        for raw in rows_raw:
            trans_nr = _str(raw.get("TransNr"))
            acc_number = _str(raw.get("AccNumber"))

            if not trans_nr or not acc_number:
                skipped += 1
                continue

            rows.append(
                HansaGlTransaction(
                    company_no=company_no,
                    trans_nr=trans_nr,
                    number=_str(raw.get("Number")),
                    acc_number=acc_number,
                    trans_date=_date(raw.get("TransDate")),
                    reg_date=_date(raw.get("RegDate")),
                    deb_val=_dec(raw.get("DebVal")),
                    cred_val=_dec(raw.get("CredVal")),
                    deb_val2=_dec(raw.get("DebVal2")),
                    cred_val2=_dec(raw.get("CredVal2")),
                    comment=_str(raw.get("Comment")),
                    vat_code=_str(raw.get("VATCode")),
                    qty=_dec(raw.get("Qty")),
                    curncy=_str(raw.get("Curncy")),
                )
            )

        # Bulk upsert: insert new rows; on conflict (same company+trans_nr)
        # update the financial amounts in case a re-fetch returns revised data.
        if rows:
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            stmt = pg_insert(HansaGlTransaction).values(
                [
                    {
                        "company_no": r.company_no,
                        "trans_nr": r.trans_nr,
                        "number": r.number,
                        "acc_number": r.acc_number,
                        "trans_date": r.trans_date,
                        "reg_date": r.reg_date,
                        "deb_val": r.deb_val,
                        "cred_val": r.cred_val,
                        "deb_val2": r.deb_val2,
                        "cred_val2": r.cred_val2,
                        "comment": r.comment,
                        "vat_code": r.vat_code,
                        "qty": r.qty,
                        "curncy": r.curncy,
                    }
                    for r in rows
                ]
            )
            stmt = stmt.on_conflict_do_update(
                constraint="uq_hansa_gl_transactions_co_transnr",
                set_={
                    "acc_number": stmt.excluded.acc_number,
                    "trans_date": stmt.excluded.trans_date,
                    "reg_date": stmt.excluded.reg_date,
                    "deb_val": stmt.excluded.deb_val,
                    "cred_val": stmt.excluded.cred_val,
                    "deb_val2": stmt.excluded.deb_val2,
                    "cred_val2": stmt.excluded.cred_val2,
                    "comment": stmt.excluded.comment,
                    "fetched_at": datetime.now(timezone.utc),
                },
            )
            db.execute(stmt)

        refresh_run.status = "success"
        refresh_run.finished_at = datetime.now(timezone.utc)
        refresh_run.records_processed = len(rows)
        refresh_run.message = (
            f"GL transactions synced. company={company_no} "
            f"period={date_from}:{date_to} "
            f"fetched={len(rows_raw)} stored={len(rows)} skipped={skipped}"
        )
        db.commit()
        db.refresh(refresh_run)
        return refresh_run

    except Exception as error:
        db.rollback()
        failed = db.get(RefreshRun, refresh_run.id)
        if failed:
            failed.status = "failed"
            failed.finished_at = datetime.now(timezone.utc)
            failed.message = str(error)
            db.commit()
            db.refresh(failed)
            return failed
        raise
