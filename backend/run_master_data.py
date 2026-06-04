"""
Standalone master-data refresh script.
Run from backend/: python run_master_data.py
Streams items and customers page-by-page to avoid OOM.
"""
import asyncio
import sys
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.config import settings
from app.db.database import SessionLocal
from app.db.models import Customer, Item, ItemGroup
from app.services.hansa_client import HansaClient


def to_decimal(v):
    try:
        return Decimal(str(v)) if v not in (None, "") else None
    except (InvalidOperation, ValueError):
        return None


def to_int(v):
    try:
        return int(v) if v not in (None, "") else None
    except (ValueError, TypeError):
        return None


async def main():
    company_no = settings.hansa_master_company_no
    print(f"Master company: {company_no}", flush=True)

    client = HansaClient()
    db = SessionLocal()
    total = 0

    try:
        # ── Item Groups ───────────────────────────────────────────────────────
        print("Fetching item groups...", flush=True)
        groups = await client.get_item_groups()
        vals = [
            {"company_no": company_no, "code": r["Code"], "comment": r.get("Comment")}
            for r in groups if r.get("Code")
        ]
        if vals:
            s = pg_insert(ItemGroup).values(vals)
            s = s.on_conflict_do_update(
                index_elements=["company_no", "code"],
                set_={"comment": s.excluded.comment, "updated_at": datetime.now(timezone.utc)},
            )
            db.execute(s)
            db.commit()
        total += len(vals)
        print(f"  item_groups: {len(vals)}", flush=True)

        # ── Items (paginated) ────────────────────────────────────────────────
        print("Fetching items (paginated)...", flush=True)
        items_total = 0
        path = (
            f"api/{company_no}/INVc"
            "?fields=Code,AlternativeCode,Name,Group,Weight,UnitCoefficient"
        )
        async for page in client.iter_pages(path):
            vals = [
                {
                    "company_no": company_no,
                    "code": r["Code"],
                    "alternative_code": r.get("AlternativeCode"),
                    "name": r.get("Name"),
                    "item_group_code": r.get("Group"),
                    "weight": to_decimal(r.get("Weight")),
                    "unit_coefficient": to_decimal(r.get("UnitCoefficient")),
                }
                for r in page if r.get("Code")
            ]
            if vals:
                s = pg_insert(Item).values(vals)
                s = s.on_conflict_do_update(
                    index_elements=["company_no", "code"],
                    set_={
                        "name": s.excluded.name,
                        "item_group_code": s.excluded.item_group_code,
                        "weight": s.excluded.weight,
                        "unit_coefficient": s.excluded.unit_coefficient,
                        "updated_at": datetime.now(timezone.utc),
                    },
                )
                db.execute(s)
                db.commit()
            items_total += len(vals)
            print(f"  items so far: {items_total}", flush=True)
        total += items_total
        print(f"  items DONE: {items_total}", flush=True)

        # ── Customers (paginated) ────────────────────────────────────────────
        print("Fetching customers (paginated)...", flush=True)
        custs_total = 0
        path2 = f"api/{company_no}/CUVc?fields=Code,Name,CUType&filter.CUType=1"
        async for page in client.iter_pages(path2):
            vals = [
                {
                    "company_no": company_no,
                    "code": r["Code"],
                    "name": r.get("Name") or r["Code"],
                    "cu_type": to_int(r.get("CUType")),
                }
                for r in page if r.get("Code")
            ]
            if vals:
                s = pg_insert(Customer).values(vals)
                s = s.on_conflict_do_update(
                    index_elements=["company_no", "code"],
                    set_={
                        "name": s.excluded.name,
                        "cu_type": s.excluded.cu_type,
                        "updated_at": datetime.now(timezone.utc),
                    },
                )
                db.execute(s)
                db.commit()
            custs_total += len(vals)
            print(f"  customers so far: {custs_total}", flush=True)
        total += custs_total
        print(f"  customers DONE: {custs_total}", flush=True)

        print(f"\n=== MASTER DATA COMPLETE — {total} records ===", flush=True)

    except Exception:
        import traceback
        traceback.print_exc()
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


asyncio.run(main())
