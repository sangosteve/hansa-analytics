"""
One-shot script to populate the Neon database from Hansa.
Run from the backend/ directory:  python run_refresh.py

By default runs all four companies: 3, 4, 5, 6.
Use --companies to restrict, e.g.:  python run_refresh.py --companies 4 5
Use --skip-master to skip master-data fetch (items/customers).

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

ALL_COMPANIES = ["3", "4", "5", "6"]


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


def parse_args():
    args = sys.argv[1:]
    skip_master = "--skip-master" in args
    if "--companies" in args:
        idx = args.index("--companies")
        companies = []
        for a in args[idx + 1:]:
            if a.startswith("--"):
                break
            companies.append(a)
        if not companies:
            log("ERROR: --companies requires at least one company number")
            sys.exit(1)
    else:
        companies = ALL_COMPANIES
    return skip_master, companies


async def main():
    skip_master, companies = parse_args()

    log(f"Companies to refresh: {companies}")
    log(f"Date range: {DATE_FROM} → {DATE_TO}")

    total_steps = (0 if skip_master else 1) + len(companies) * 3 + 1
    step = 0

    def next_step(label):
        nonlocal step
        step += 1
        return f"Step {step}/{total_steps}: {label}"

    if not skip_master:
        await run_step(next_step("master-data"), refresh_master_data)
    else:
        log("=== master-data (SKIPPED) ===")

    for company_no in companies:
        log(f"\n--- Company {company_no} ---")

        await run_step(
            next_step(f"source invoices  [company={company_no}]"),
            refresh_invoice_source,
            DATE_FROM, DATE_TO, company_no,
        )

        await run_step(
            next_step(f"source deliveries [company={company_no}]"),
            refresh_delivery_source,
            DATE_FROM, DATE_TO, company_no,
        )

        await run_step(
            next_step(f"fact-sales        [company={company_no}]"),
            rebuild_fact_sales_lines,
            DATE_FROM, DATE_TO, company_no,
        )

    await run_step(next_step("customer-movement (all companies)"),
                   rebuild_customer_product_group_movement)

    log("\n=== ALL DONE ===")


asyncio.run(main())
