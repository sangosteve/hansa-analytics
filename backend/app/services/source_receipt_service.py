"""
Customer receipt source refresh service.
Fetches customer payment receipts (IPVc register) from Hansa per company and date range.
Uses range-reload strategy: delete existing rows for the period, then insert fresh data.
"""

from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import HansaReceipt, RefreshRun
from app.services.hansa_client import HansaClient


def to_decimal_or_none(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def to_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def parse_date_or_none(value: Any) -> date | None:
    if value is None or value == "" or value == "0000-00-00":
        return None
    try:
        if isinstance(value, date):
            return value
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


async def refresh_receipt_source(
    db: Session,
    date_from: date,
    date_to: date,
    company_no: str | None = None,
) -> RefreshRun:
    company_no = company_no or settings.hansa_company_no

    refresh_run = RefreshRun(
        company_no=company_no,
        refresh_type="source_receipts",
        status="running",
        date_from=date_from,
        date_to=date_to,
    )
    db.add(refresh_run)
    db.commit()
    db.refresh(refresh_run)

    client = HansaClient(company_no=company_no)

    try:
        receipts = await client.get_receipts(
            date_from.isoformat(),
            date_to.isoformat(),
        )

        # Range reload: delete existing receipts for this company and period
        db.execute(
            text("""
                DELETE FROM hansa_receipts
                WHERE company_no = :company_no
                  AND trans_date >= :date_from
                  AND trans_date <= :date_to
            """),
            {"company_no": company_no, "date_from": date_from, "date_to": date_to},
        )

        rows: list[HansaReceipt] = []
        skipped = 0

        for doc in receipts:
            ser_nr = str(doc.get("SerNr") or "")
            if not ser_nr:
                skipped += 1
                continue

            rows.append(
                HansaReceipt(
                    company_no=company_no,
                    ser_nr=ser_nr,
                    cust_code=doc.get("CustCode") or None,
                    trans_date=parse_date_or_none(doc.get("TransDate")),
                    invoice_nr=doc.get("InvoiceNr") or doc.get("InvNr") or None,
                    inv_curncy=doc.get("InvCurncy") or None,
                    pay_date=parse_date_or_none(doc.get("PayDate")),
                    rec_curncy=doc.get("RecCurncy") or None,
                    rec_val=to_decimal_or_none(doc.get("RecVal")),
                    ok_flag=to_int(doc.get("OkFlag") or doc.get("OKFlag")),
                )
            )

        if rows:
            db.add_all(rows)

        refresh_run.status = "success"
        refresh_run.finished_at = datetime.now(timezone.utc)
        refresh_run.records_processed = len(rows)
        refresh_run.message = (
            f"Receipts source refreshed. company={company_no} "
            f"Fetched: {len(receipts)}. Stored: {len(rows)}. Skipped: {skipped}."
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
