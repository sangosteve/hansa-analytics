import hashlib
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import HansaDeliveryHeader, HansaDeliveryLine, RefreshRun
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


async def refresh_delivery_source(
    db: Session,
    date_from: date,
    date_to: date,
) -> RefreshRun:
    company_no = settings.hansa_company_no

    refresh_run = RefreshRun(
        company_no=company_no,
        refresh_type="source_deliveries",
        status="running",
        date_from=date_from,
        date_to=date_to,
    )

    db.add(refresh_run)
    db.commit()
    db.refresh(refresh_run)

    client = HansaClient()

    try:
        deliveries = await client.get_deliveries(
            date_from.isoformat(),
            date_to.isoformat(),
        )

        # Range reload: delete existing source delivery rows for this period.
        db.execute(
            text(
                """
                DELETE FROM hansa_delivery_lines dl
                USING hansa_delivery_headers dh
                WHERE dl.company_no = dh.company_no
                  AND dl.ser_nr = dh.ser_nr
                  AND dh.company_no = :company_no
                  AND dh.ship_date >= :date_from
                  AND dh.ship_date <= :date_to;
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
                DELETE FROM hansa_delivery_headers
                WHERE company_no = :company_no
                  AND ship_date >= :date_from
                  AND ship_date <= :date_to;
                """
            ),
            {
                "company_no": company_no,
                "date_from": date_from,
                "date_to": date_to,
            },
        )

        headers: list[HansaDeliveryHeader] = []
        lines: list[HansaDeliveryLine] = []

        skipped_headers = 0
        skipped_lines = 0

        for document in deliveries:
            ser_nr = str(document.get("SerNr") or "")
            ship_date_value = document.get("ShipDate")

            if not ser_nr or not ship_date_value:
                skipped_headers += 1
                continue

            ship_date = parse_date(ship_date_value)

            headers.append(
                HansaDeliveryHeader(
                    company_no=company_no,
                    ser_nr=ser_nr,
                    order_nr=document.get("OrderNr"),
                    ship_date=ship_date,
                    cust_code=document.get("CustCode"),
                    ok_flag=to_int(document.get("OKFlag")),
                    location=document.get("Location"),
                    weight=to_decimal(document.get("Weight")),
                    source_sequence=document.get("@sequence"),
                    source_url=document.get("@url"),
                )
            )

            document_rows = document.get("rows") or []

            for index, line in enumerate(document_rows):
                row_number = str(line.get("@rownumber") or index)

                source_row_hash = make_source_row_hash(
                    company_no,
                    "delivery",
                    ser_nr,
                    document.get("OrderNr"),
                    row_number,
                    line.get("ArtCode"),
                    line.get("Ship"),
                    line.get("Location"),
                )

                if not row_number:
                    skipped_lines += 1
                    continue

                lines.append(
                    HansaDeliveryLine(
                        company_no=company_no,
                        ser_nr=ser_nr,
                        row_number=row_number,
                        art_code=line.get("ArtCode"),
                        ship=to_decimal(line.get("Ship")),
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
            f"Delivery source refreshed successfully. "
            f"Documents fetched: {len(deliveries)}. "
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