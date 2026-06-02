import hashlib
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import HansaInvoiceHeader, HansaInvoiceLine, RefreshRun
from app.services.hansa_client import HansaClient


def to_decimal(value: Any) -> Decimal:
    if value is None or value == "":
        return Decimal("0")

    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


def to_int(value: Any) -> int | None:
    if value is None or value == "":
        return None

    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def parse_date(value: Any) -> date:
    if isinstance(value, date):
        return value

    return datetime.strptime(str(value), "%Y-%m-%d").date()


def make_source_row_hash(*values: object) -> str:
    raw = "|".join("" if value is None else str(value) for value in values)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def refresh_invoice_source(
    db: Session,
    date_from: date,
    date_to: date,
) -> RefreshRun:
    company_no = settings.hansa_company_no

    refresh_run = RefreshRun(
        company_no=company_no,
        refresh_type="source_invoices",
        status="running",
        date_from=date_from,
        date_to=date_to,
    )

    db.add(refresh_run)
    db.commit()
    db.refresh(refresh_run)

    client = HansaClient()

    try:
        invoices = await client.get_invoices(
            date_from.isoformat(),
            date_to.isoformat(),
        )

        # Range reload: delete existing source invoice rows for this period.
        db.execute(
            text(
                """
                DELETE FROM hansa_invoice_lines il
                USING hansa_invoice_headers ih
                WHERE il.company_no = ih.company_no
                  AND il.ser_nr = ih.ser_nr
                  AND ih.company_no = :company_no
                  AND ih.inv_date >= :date_from
                  AND ih.inv_date <= :date_to;
                """
            ),
            {
                "company_no": company_no,
                "date_from": date_from,
                "date_to": date_to,
            },
        )

        db.execute(
            text(
                """
                DELETE FROM hansa_invoice_headers
                WHERE company_no = :company_no
                  AND inv_date >= :date_from
                  AND inv_date <= :date_to;
                """
            ),
            {
                "company_no": company_no,
                "date_from": date_from,
                "date_to": date_to,
            },
        )

        headers: list[HansaInvoiceHeader] = []
        lines: list[HansaInvoiceLine] = []

        skipped_headers = 0
        skipped_lines = 0

        for document in invoices:
            ser_nr = str(document.get("SerNr") or "")
            inv_date_value = document.get("InvDate")

            if not ser_nr or not inv_date_value:
                skipped_headers += 1
                continue

            inv_date = parse_date(inv_date_value)

            headers.append(
                HansaInvoiceHeader(
                    company_no=company_no,
                    ser_nr=ser_nr,
                    inv_date=inv_date,
                    cust_code=document.get("CustCode"),
                    pay_deal=document.get("PayDeal"),
                    ok_flag=to_int(document.get("OKFlag")),
                    inv_type=document.get("InvType"),
                    cred_mark=document.get("CredMark"),
                    sales_man=document.get("SalesMan"),
                    upd_stock_flag=to_int(document.get("UpdStockFlag")),
                    location=document.get("Location"),
                    source_sequence=document.get("@sequence"),
                    source_url=document.get("@url"),
                )
            )

            document_rows = document.get("rows") or []

            for index, line in enumerate(document_rows):
                row_number = str(line.get("@rownumber") or index)

                source_row_hash = make_source_row_hash(
                    company_no,
                    "invoice",
                    ser_nr,
                    row_number,
                    line.get("ArtCode"),
                    line.get("Quant"),
                    line.get("Location"),
                    line.get("NotUpdStockFlag"),
                )

                if not row_number:
                    skipped_lines += 1
                    continue

                lines.append(
                    HansaInvoiceLine(
                        company_no=company_no,
                        ser_nr=ser_nr,
                        row_number=row_number,
                        art_code=line.get("ArtCode"),
                        quant=to_decimal(line.get("Quant")),
                        not_upd_stock_flag=to_int(line.get("NotUpdStockFlag")),
                        location=line.get("Location"),
                        source_row_hash=source_row_hash,
                    )
                )

        if headers:
            db.add_all(headers)

        if lines:
            db.add_all(lines)

        refresh_run.status = "success"
        refresh_run.finished_at = datetime.now(timezone.utc)
        refresh_run.records_processed = len(headers) + len(lines)
        refresh_run.message = (
            f"Invoice source refreshed successfully. "
            f"Documents fetched: {len(invoices)}. "
            f"Headers inserted: {len(headers)}. "
            f"Lines inserted: {len(lines)}. "
            f"Skipped headers: {skipped_headers}. "
            f"Skipped lines: {skipped_lines}."
        )

        db.commit()
        db.refresh(refresh_run)

        return refresh_run

    except Exception as error:
        db.rollback()

        failed_refresh_run = db.get(RefreshRun, refresh_run.id)

        if failed_refresh_run:
            failed_refresh_run.status = "failed"
            failed_refresh_run.finished_at = datetime.now(timezone.utc)
            failed_refresh_run.message = str(error)
            db.commit()
            db.refresh(failed_refresh_run)
            return failed_refresh_run

        raise