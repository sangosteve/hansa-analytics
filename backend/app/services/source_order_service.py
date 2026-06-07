"""
Sales order source refresh service.
Fetches sales orders (SOVc register) from Hansa per company and date range.
Uses range-reload strategy: delete existing rows for the period, then insert fresh data.
"""

import hashlib
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import HansaOrderHeader, HansaOrderLine, RefreshRun
from app.services.hansa_client import HansaClient


def to_decimal(value: Any) -> Decimal:
    if value is None or value == "":
        return Decimal("0")
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


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


def make_source_row_hash(*values: object) -> str:
    raw = "|".join("" if v is None else str(v) for v in values)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def refresh_order_source(
    db: Session,
    date_from: date,
    date_to: date,
    company_no: str | None = None,
) -> RefreshRun:
    company_no = company_no or settings.hansa_company_no

    refresh_run = RefreshRun(
        company_no=company_no,
        refresh_type="source_orders",
        status="running",
        date_from=date_from,
        date_to=date_to,
    )
    db.add(refresh_run)
    db.commit()
    db.refresh(refresh_run)

    client = HansaClient(company_no=company_no)

    try:
        orders = await client.get_sales_orders(
            date_from.isoformat(),
            date_to.isoformat(),
        )

        # Range reload: delete existing orders for this company and period
        db.execute(
            text("""
                DELETE FROM hansa_order_lines ol
                USING hansa_order_headers oh
                WHERE ol.company_no = oh.company_no
                  AND ol.ser_nr = oh.ser_nr
                  AND oh.company_no = :company_no
                  AND oh.order_date >= :date_from
                  AND oh.order_date <= :date_to
            """),
            {"company_no": company_no, "date_from": date_from, "date_to": date_to},
        )
        db.execute(
            text("""
                DELETE FROM hansa_order_headers
                WHERE company_no = :company_no
                  AND order_date >= :date_from
                  AND order_date <= :date_to
            """),
            {"company_no": company_no, "date_from": date_from, "date_to": date_to},
        )

        headers: list[HansaOrderHeader] = []
        lines: list[HansaOrderLine] = []
        skipped_headers = 0
        skipped_lines = 0

        for document in orders:
            ser_nr = str(document.get("SerNr") or "")
            if not ser_nr:
                skipped_headers += 1
                continue

            headers.append(
                HansaOrderHeader(
                    company_no=company_no,
                    ser_nr=ser_nr,
                    cust_code=document.get("CustCode") or None,
                    order_date=parse_date_or_none(document.get("OrderDate")),
                    sales_man=document.get("SalesMan") or None,
                    ok_flag=to_int(document.get("OKFlag")),
                    currency_code=document.get("CurncyCode") or None,
                    pay_deal=document.get("PayDeal") or None,
                    sum1=to_decimal_or_none(document.get("Sum1")),
                    sum4=to_decimal_or_none(document.get("Sum4")),
                    base_sum4=to_decimal_or_none(document.get("BaseSum4")),
                    source_sequence=document.get("@sequence"),
                    source_url=document.get("@url"),
                )
            )

            document_rows = document.get("rows") or []
            for index, line in enumerate(document_rows):
                row_number = str(line.get("@rownumber") or index)

                source_row_hash = make_source_row_hash(
                    company_no,
                    "order",
                    ser_nr,
                    row_number,
                    line.get("ArtCode"),
                    line.get("Quant"),
                )

                if not row_number:
                    skipped_lines += 1
                    continue

                lines.append(
                    HansaOrderLine(
                        company_no=company_no,
                        ser_nr=ser_nr,
                        row_number=row_number,
                        art_code=line.get("ArtCode") or None,
                        quant=to_decimal(line.get("Quant")),
                        price=to_decimal_or_none(line.get("Price")),
                        disc=to_decimal_or_none(line.get("Disc")),
                        amount=to_decimal_or_none(line.get("Amount") or line.get("Sum")),
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
            f"Orders source refreshed. company={company_no} "
            f"Fetched: {len(orders)}. Headers: {len(headers)}. Lines: {len(lines)}. "
            f"Skipped headers: {skipped_headers}. Skipped lines: {skipped_lines}."
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
