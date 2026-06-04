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


async def refresh_master_data(db: Session, company_no: str | None = None) -> RefreshRun:
    company_no = company_no or settings.hansa_master_company_no

    refresh_run = RefreshRun(
        company_no=company_no,
        refresh_type="master_data",
        status="running",
    )
    db.add(refresh_run)
    db.commit()
    db.refresh(refresh_run)

    client = HansaClient()
    total_records = 0

    try:
        # ── Item Groups (small — fetch all at once) ──────────────────────────
        item_groups = await client.get_item_groups()
        rows_to_insert = [
            {"company_no": company_no, "code": row.get("Code"), "comment": row.get("Comment")}
            for row in item_groups if row.get("Code")
        ]
        if rows_to_insert:
            stmt = insert(ItemGroup).values(rows_to_insert)
            stmt = stmt.on_conflict_do_update(
                index_elements=["company_no", "code"],
                set_={
                    "comment": stmt.excluded.comment,
                    "updated_at": datetime.now(timezone.utc),
                },
            )
            db.execute(stmt)
            db.commit()
        total_records += len(rows_to_insert)
        print(f"  item_groups: {len(rows_to_insert)}", flush=True)

        # ── Items — stream one page at a time, bulk-upsert per page ─────────
        items_total = 0
        async for page in client.iter_pages(
            f"api/{company_no}/INVc"
            "?fields=Code,AlternativeCode,Name,Group,Weight,UnitCoefficient"
        ):
            rows_to_insert = []
            for row in page:
                code = row.get("Code")
                if not code:
                    continue
                rows_to_insert.append({
                    "company_no": company_no,
                    "code": code,
                    "alternative_code": row.get("AlternativeCode"),
                    "name": row.get("Name"),
                    "item_group_code": row.get("Group"),
                    "weight": to_decimal(row.get("Weight")),
                    "unit_coefficient": to_decimal(row.get("UnitCoefficient")),
                })
            if rows_to_insert:
                stmt = insert(Item).values(rows_to_insert)
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
                db.commit()
                items_total += len(rows_to_insert)
                print(f"  items page committed: {items_total} so far", flush=True)
        total_records += items_total
        print(f"  items total: {items_total}", flush=True)

        # ── Customers — stream one page at a time ───────────────────────────
        custs_total = 0
        async for page in client.iter_pages(
            f"api/{company_no}/CUVc?fields=Code,Name,CUType&filter.CUType=1"
        ):
            rows_to_insert = []
            for row in page:
                code = row.get("Code")
                if not code:
                    continue
                rows_to_insert.append({
                    "company_no": company_no,
                    "code": code,
                    "name": row.get("Name") or code,
                    "cu_type": to_int(row.get("CUType")),
                })
            if rows_to_insert:
                stmt = insert(Customer).values(rows_to_insert)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["company_no", "code"],
                    set_={
                        "name": stmt.excluded.name,
                        "cu_type": stmt.excluded.cu_type,
                        "updated_at": datetime.now(timezone.utc),
                    },
                )
                db.execute(stmt)
                db.commit()
                custs_total += len(rows_to_insert)
                print(f"  customers page committed: {custs_total} so far", flush=True)
        total_records += custs_total
        print(f"  customers total: {custs_total}", flush=True)

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
