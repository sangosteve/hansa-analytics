"""
One-shot script to populate the Neon database from Hansa.
Run from the backend/ directory:  python run_refresh.py

Uses a fresh DB session per step to avoid Neon idle-connection timeouts
during long Hansa API fetches.
"""
import asyncio
import sys
from datetime import date

from app.db.database import SessionLocal
from app.services.master_data_service import refresh_master_data
from app.services.source_invoice_service import refresh_invoice_source
from app.services.source_delivery_service import refresh_delivery_source
from app.services.fact_sales_service import rebuild_fact_sales_lines
from app.services.movement_service import rebuild_customer_product_group_movement

DATE_FROM = date(2023, 1, 1)
DATE_TO   = date(2026, 12, 31)


def log(msg):
    print(msg, flush=True)


async def run_step(label, coro_fn, *args, **kwargs):
    log(f"=== {label} ===")
    db = SessionLocal()
    try:
        result = coro_fn(db, *args, **kwargs)
        if asyncio.iscoroutine(result):
            r = await result
        else:
            r = result
        log(f"  → {r.status}  records={r.records_processed}  msg={r.message}")
        return r
    except Exception as e:
        log(f"  ERROR: {e}")
        import traceback; traceback.print_exc()
        raise
    finally:
        db.close()


async def main():
    skip_master = "--skip-master" in sys.argv

    if not skip_master:
        await run_step("Step 1/5: master-data", refresh_master_data)
    else:
        log("=== Step 1/5: master-data (SKIPPED) ===")

    await run_step("Step 2/5: source invoices", refresh_invoice_source,
                   DATE_FROM, DATE_TO)

    await run_step("Step 3/5: source deliveries", refresh_delivery_source,
                   DATE_FROM, DATE_TO)

    await run_step("Step 4/5: fact-sales", rebuild_fact_sales_lines,
                   DATE_FROM, DATE_TO)

    await run_step("Step 5/5: customer-movement",
                   rebuild_customer_product_group_movement)

    log("=== ALL DONE ===")


asyncio.run(main())
