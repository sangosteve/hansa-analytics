from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Customer, Item, ItemGroup, RefreshRun
from app.services.hansa_client import HansaClient


def to_decimal(value):
    if value is None or value == "":
        return None

    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def to_int(value):
    if value is None or value == "":
        return None

    try:
        return int(value)
    except ValueError:
        return None


async def refresh_master_data(db: Session) -> RefreshRun:
    company_no = settings.hansa_company_no

    refresh_run = RefreshRun(
        company_no=company_no,
        refresh_type="master_data",
        status="running",
    )

    db.add(refresh_run)
    db.commit()
    db.refresh(refresh_run)

    client = HansaClient()

    try:
        item_groups = await client.get_item_groups()
        items = await client.get_items()
        customers = await client.get_customers()

        # Item Groups
        for row in item_groups:
            code = row.get("Code")

            if not code:
                continue

            stmt = insert(ItemGroup).values(
                company_no=company_no,
                code=code,
                comment=row.get("Comment"),
            )

            stmt = stmt.on_conflict_do_update(
                index_elements=["company_no", "code"],
                set_={
                    "comment": stmt.excluded.comment,
                    "updated_at": datetime.now(timezone.utc),
                },
            )

            db.execute(stmt)

        # Items
        for row in items:
            code = row.get("Code")

            if not code:
                continue

            stmt = insert(Item).values(
                company_no=company_no,
                code=code,
                alternative_code=row.get("AlternativeCode"),
                name=row.get("Name"),
                item_group_code=row.get("Group"),
                weight=to_decimal(row.get("Weight")),
                unit_coefficient=to_decimal(row.get("UnitCoefficient")),
            )

            stmt = stmt.on_conflict_do_update(
                index_elements=["company_no", "code"],
                set_={
                    "alternative_code": stmt.excluded.alternative_code,
                    "name": stmt.excluded.name,
                    "item_group_code": stmt.excluded.item_group_code,
                    "weight": stmt.excluded.weight,
                    "unit_coefficient": stmt.excluded.unit_coefficient,
                    "updated_at": datetime.now(timezone.utc),
                },
            )

            db.execute(stmt)

        # Customers
        for row in customers:
            code = row.get("Code")
            name = row.get("Name")

            if not code:
                continue

            stmt = insert(Customer).values(
                company_no=company_no,
                code=code,
                name=name or code,
                cu_type=to_int(row.get("CUType")),
            )

            stmt = stmt.on_conflict_do_update(
                index_elements=["company_no", "code"],
                set_={
                    "name": stmt.excluded.name,
                    "cu_type": stmt.excluded.cu_type,
                    "updated_at": datetime.now(timezone.utc),
                },
            )

            db.execute(stmt)

        total_records = len(item_groups) + len(items) + len(customers)

        refresh_run.status = "success"
        refresh_run.finished_at = datetime.now(timezone.utc)
        refresh_run.records_processed = total_records
        refresh_run.message = "Master data refreshed successfully"

        db.commit()
        db.refresh(refresh_run)

        return refresh_run

    except Exception as error:
        db.rollback()

        refresh_run.status = "failed"
        refresh_run.finished_at = datetime.now(timezone.utc)
        refresh_run.message = str(error)

        db.add(refresh_run)
        db.commit()
        db.refresh(refresh_run)

        raise