import hashlib
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import and_, delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Customer, Item, ItemGroup, RefreshRun, SalesTransaction
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


def build_lookup_maps(db: Session, company_no: str):
    customers = db.execute(
        select(Customer).where(Customer.company_no == company_no)
    ).scalars().all()

    items = db.execute(
        select(Item).where(Item.company_no == company_no)
    ).scalars().all()

    item_groups = db.execute(
        select(ItemGroup).where(ItemGroup.company_no == company_no)
    ).scalars().all()

    customer_by_code = {
        customer.code: customer
        for customer in customers
    }

    item_by_code = {
        item.code: item
        for item in items
    }

    item_by_alternative_code = {
        item.alternative_code: item
        for item in items
        if item.alternative_code
    }

    item_group_by_code = {
        item_group.code: item_group
        for item_group in item_groups
    }

    return (
        customer_by_code,
        item_by_code,
        item_by_alternative_code,
        item_group_by_code,
    )


def get_item_for_art_code(
    art_code: str,
    item_by_code: dict,
    item_by_alternative_code: dict,
):
    return item_by_code.get(art_code) or item_by_alternative_code.get(art_code)


def calculate_invoice_tonnes(
    quantity: Decimal,
    unit_coefficient: Decimal,
    pay_deal: str | None,
) -> Decimal:
    tonnes = (quantity * unit_coefficient) / Decimal("1000")

    if pay_deal == "CN":
        return tonnes * Decimal("-1")

    return tonnes


def calculate_delivery_tonnes(
    quantity: Decimal,
    unit_coefficient: Decimal,
) -> Decimal:
    return (quantity * unit_coefficient) / Decimal("1000")


async def refresh_transactions(
    db: Session,
    date_from: date,
    date_to: date,
) -> RefreshRun:
    company_no = settings.hansa_company_no

    refresh_run = RefreshRun(
        company_no=company_no,
        refresh_type="transactions",
        status="running",
        date_from=date_from,
        date_to=date_to,
    )

    db.add(refresh_run)
    db.commit()
    db.refresh(refresh_run)

    client = HansaClient()

    try:
        date_from_text = date_from.isoformat()
        date_to_text = date_to.isoformat()

        invoices = await client.get_invoices(date_from_text, date_to_text)
        deliveries = await client.get_deliveries(date_from_text, date_to_text)

        (
            customer_by_code,
            item_by_code,
            item_by_alternative_code,
            item_group_by_code,
        ) = build_lookup_maps(db, company_no)

        # Range reload:
        # Remove existing invoice/delivery rows in this date range before inserting fresh rows.
        db.execute(
            delete(SalesTransaction).where(
                and_(
                    SalesTransaction.company_no == company_no,
                    SalesTransaction.transaction_date >= date_from,
                    SalesTransaction.transaction_date <= date_to,
                    SalesTransaction.source_type.in_(["invoice", "delivery"]),
                )
            )
        )

        transactions: list[SalesTransaction] = []

        skipped_invoices_missing_fields = 0
        skipped_deliveries_missing_fields = 0
        skipped_invoices_no_rows = 0
        skipped_deliveries_no_rows = 0

        # ---------------------------------------------------------
        # INVOICES
        # Hansa returns invoice header + rows[].
        # We create one sales_transactions row per invoice line.
        # ---------------------------------------------------------
        for document in invoices:
            source_no = str(document.get("SerNr") or "")
            transaction_date_text = document.get("InvDate")
            customer_code = document.get("CustCode")
            pay_deal = document.get("PayDeal")

            document_rows = document.get("rows") or []

            if not document_rows:
                skipped_invoices_no_rows += 1
                continue

            for line in document_rows:
                row_number = line.get("@rownumber")
                art_code = line.get("ArtCode")
                quantity = to_decimal(line.get("Quant"))

                if not source_no or not transaction_date_text or not customer_code or not art_code:
                    skipped_invoices_missing_fields += 1
                    continue

                transaction_date = parse_date(transaction_date_text)

                customer = customer_by_code.get(customer_code)
                item = get_item_for_art_code(
                    art_code,
                    item_by_code,
                    item_by_alternative_code,
                )

                unit_coefficient = to_decimal(item.unit_coefficient if item else None)
                tonnes = calculate_invoice_tonnes(
                    quantity=quantity,
                    unit_coefficient=unit_coefficient,
                    pay_deal=pay_deal,
                )

                item_group_code = item.item_group_code if item else None
                item_group = (
                    item_group_by_code.get(item_group_code)
                    if item_group_code
                    else None
                )

                # Prefer line location; if blank, use document/header location.
                line_location = line.get("Location") or document.get("Location")

                source_row_hash = make_source_row_hash(
                    company_no,
                    "invoice",
                    source_no,
                    row_number,
                    transaction_date_text,
                    customer_code,
                    art_code,
                    quantity,
                    line_location,
                    pay_deal,
                    document.get("CredMark"),
                    document.get("InvType"),
                )

                transactions.append(
                    SalesTransaction(
                        company_no=company_no,
                        transaction_date=transaction_date,
                        source_type="invoice",
                        source_no=source_no,
                        source_row_hash=source_row_hash,
                        order_no=None,
                        customer_code=customer_code,
                        customer_name=customer.name if customer else None,
                        item_code=art_code,
                        item_name=item.name if item else None,
                        item_group_code=item_group_code,
                        item_group_name=item_group.comment if item_group else None,
                        location=line_location,
                        salesperson=document.get("SalesMan"),
                        quantity=quantity,
                        source_weight=None,
                        item_weight=to_decimal(item.weight if item else None),
                        unit_coefficient=unit_coefficient,
                        tonnes=tonnes,
                        pay_deal=pay_deal,
                        credit_mark=document.get("CredMark"),
                        invoice_type=document.get("InvType"),
                        ok_flag=to_int(document.get("OKFlag")),
                        upd_stock_flag=to_int(document.get("UpdStockFlag")),
                        not_upd_stock_flag=to_int(line.get("NotUpdStockFlag")),
                    )
                )

        # ---------------------------------------------------------
        # DELIVERIES
        # Hansa returns delivery header + rows[].
        # We create one sales_transactions row per delivery line.
        # ---------------------------------------------------------
        for document in deliveries:
            source_no = str(document.get("SerNr") or "")
            transaction_date_text = document.get("ShipDate")
            customer_code = document.get("CustCode")
            order_no = document.get("OrderNr")

            document_rows = document.get("rows") or []

            if not document_rows:
                skipped_deliveries_no_rows += 1
                continue

            for line in document_rows:
                row_number = line.get("@rownumber")
                art_code = line.get("ArtCode")
                quantity = to_decimal(line.get("Ship"))

                if not source_no or not transaction_date_text or not customer_code or not art_code:
                    skipped_deliveries_missing_fields += 1
                    continue

                transaction_date = parse_date(transaction_date_text)

                customer = customer_by_code.get(customer_code)
                item = get_item_for_art_code(
                    art_code,
                    item_by_code,
                    item_by_alternative_code,
                )

                unit_coefficient = to_decimal(item.unit_coefficient if item else None)
                tonnes = calculate_delivery_tonnes(
                    quantity=quantity,
                    unit_coefficient=unit_coefficient,
                )

                item_group_code = item.item_group_code if item else None
                item_group = (
                    item_group_by_code.get(item_group_code)
                    if item_group_code
                    else None
                )

                # Prefer line location; if blank, use document/header location.
                line_location = line.get("Location") or document.get("Location")

                source_row_hash = make_source_row_hash(
                    company_no,
                    "delivery",
                    source_no,
                    order_no,
                    row_number,
                    transaction_date_text,
                    customer_code,
                    art_code,
                    quantity,
                    line_location,
                )

                transactions.append(
                    SalesTransaction(
                        company_no=company_no,
                        transaction_date=transaction_date,
                        source_type="delivery",
                        source_no=source_no,
                        source_row_hash=source_row_hash,
                        order_no=order_no,
                        customer_code=customer_code,
                        customer_name=customer.name if customer else None,
                        item_code=art_code,
                        item_name=item.name if item else None,
                        item_group_code=item_group_code,
                        item_group_name=item_group.comment if item_group else None,
                        location=line_location,
                        salesperson=None,
                        quantity=quantity,
                        source_weight=to_decimal(document.get("Weight")),
                        item_weight=to_decimal(item.weight if item else None),
                        unit_coefficient=unit_coefficient,
                        tonnes=tonnes,
                        pay_deal=None,
                        credit_mark=None,
                        invoice_type=None,
                        ok_flag=to_int(document.get("OKFlag")),
                        upd_stock_flag=None,
                        not_upd_stock_flag=None,
                    )
                )

        if transactions:
            db.add_all(transactions)

        refresh_run.status = "success"
        refresh_run.finished_at = datetime.now(timezone.utc)
        refresh_run.records_processed = len(transactions)
        refresh_run.message = (
            f"Transactions refreshed successfully. "
            f"Invoices fetched: {len(invoices)}, deliveries fetched: {len(deliveries)}. "
            f"Rows inserted: {len(transactions)}. "
            f"Skipped invoices missing fields: {skipped_invoices_missing_fields}. "
            f"Skipped deliveries missing fields: {skipped_deliveries_missing_fields}. "
            f"Skipped invoices no rows: {skipped_invoices_no_rows}. "
            f"Skipped deliveries no rows: {skipped_deliveries_no_rows}."
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