"""
Refresh routes — trigger Hansa data pulls and fact rebuilds.

All transaction endpoints accept an optional company_no in the request body,
defaulting to the HANSA_COMPANY_NO environment variable when omitted.
This enables multi-company refresh (3, 4, 5, 6) without separate deployments.
"""

import asyncio
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from app.db.database import SessionLocal, get_db
from app.schemas.refresh import MasterDataRefreshRequest, TransactionRefreshRequest
from app.services.fact_sales_service import rebuild_fact_sales_lines
from app.services.master_data_service import refresh_master_data
from app.services.movement_service import rebuild_customer_product_group_movement
from app.services.source_delivery_service import refresh_delivery_source
from app.services.source_invoice_service import refresh_invoice_source
from app.services.stock_service import refresh_stock_status, COMPANY_LOCATIONS
from app.services.transaction_service import refresh_transactions

# ── In-memory job tracker ─────────────────────────────────────────────────────
# Simple dict so the polling endpoint can report progress.
_jobs: dict[str, dict] = {}

router = APIRouter(prefix="/api/refresh", tags=["Refresh"])


def serialize_refresh_run(refresh_run):
    return {
        "id": refresh_run.id,
        "company_no": refresh_run.company_no,
        "status": refresh_run.status,
        "message": refresh_run.message,
        "records_processed": refresh_run.records_processed,
        "date_from": refresh_run.date_from,
        "date_to": refresh_run.date_to,
        "started_at": refresh_run.started_at,
        "finished_at": refresh_run.finished_at,
    }


@router.post("/master-data")
async def refresh_master_data_route(
    payload: MasterDataRefreshRequest = MasterDataRefreshRequest(),
    db: Session = Depends(get_db),
):
    refresh_run = await refresh_master_data(
        db=db,
        company_no=payload.resolved_company_no(),
    )
    return serialize_refresh_run(refresh_run)


@router.post("/source/invoices")
async def refresh_source_invoices_route(
    payload: TransactionRefreshRequest,
    db: Session = Depends(get_db),
):
    refresh_run = await refresh_invoice_source(
        db=db,
        date_from=payload.date_from,
        date_to=payload.date_to,
        company_no=payload.resolved_company_no(),
    )
    return serialize_refresh_run(refresh_run)


@router.post("/source/deliveries")
async def refresh_source_deliveries_route(
    payload: TransactionRefreshRequest,
    db: Session = Depends(get_db),
):
    refresh_run = await refresh_delivery_source(
        db=db,
        date_from=payload.date_from,
        date_to=payload.date_to,
        company_no=payload.resolved_company_no(),
    )
    return serialize_refresh_run(refresh_run)


@router.post("/fact-sales")
def rebuild_fact_sales_route(
    payload: TransactionRefreshRequest,
    db: Session = Depends(get_db),
):
    refresh_run = rebuild_fact_sales_lines(
        db=db,
        date_from=payload.date_from,
        date_to=payload.date_to,
        company_no=payload.resolved_company_no(),
    )
    return serialize_refresh_run(refresh_run)


@router.post("/sales-pipeline")
async def refresh_sales_pipeline_route(
    payload: TransactionRefreshRequest,
    db: Session = Depends(get_db),
):
    """
    Full pipeline refresh for one company: invoices → deliveries → fact rebuild.
    Set company_no to '3', '4', '5', or '6' to refresh specific divisions.
    """
    company_no = payload.resolved_company_no()

    invoice_refresh = await refresh_invoice_source(
        db=db,
        date_from=payload.date_from,
        date_to=payload.date_to,
        company_no=company_no,
    )
    delivery_refresh = await refresh_delivery_source(
        db=db,
        date_from=payload.date_from,
        date_to=payload.date_to,
        company_no=company_no,
    )
    fact_refresh = rebuild_fact_sales_lines(
        db=db,
        date_from=payload.date_from,
        date_to=payload.date_to,
        company_no=company_no,
    )

    return {
        "status": "success",
        "company_no": company_no,
        "message": "Sales pipeline refreshed successfully",
        "steps": {
            "invoices": serialize_refresh_run(invoice_refresh),
            "deliveries": serialize_refresh_run(delivery_refresh),
            "fact_sales": serialize_refresh_run(fact_refresh),
        },
    }


# Keep old MVP endpoint until new flow is fully validated.
@router.post("/transactions")
async def refresh_transactions_route(
    payload: TransactionRefreshRequest,
    db: Session = Depends(get_db),
):
    refresh_run = await refresh_transactions(
        db=db,
        date_from=payload.date_from,
        date_to=payload.date_to,
    )
    return serialize_refresh_run(refresh_run)


@router.post("/customer-movement")
def rebuild_customer_movement_route(db: Session = Depends(get_db)):
    refresh_run = rebuild_customer_product_group_movement(db)
    return serialize_refresh_run(refresh_run)


# ── Full background refresh ───────────────────────────────────────────────────

DATE_FROM = date(2024, 1, 1)
DATE_TO   = date(2026, 6, 4)
ALL_COMPANIES = ["3", "4", "5", "6"]


def _log(job_id: str, msg: str):
    job = _jobs.get(job_id)
    if job:
        job["log"].append(f"[{datetime.now(tz=timezone.utc).strftime('%H:%M:%S')}] {msg}")
        job["current_step"] = msg
    print(msg, flush=True)


async def _run_full_refresh(job_id: str, companies: list[str], include_stock: bool):
    job = _jobs[job_id]
    job["status"] = "running"
    try:
        # 1. Master data
        _log(job_id, "Step: master-data")
        db = SessionLocal()
        try:
            r = await refresh_master_data(db)
            _log(job_id, f"  master-data → {r.status} ({r.records_processed} records)")
        finally:
            db.close()

        # 2. Per-company pipeline
        for co in companies:
            _log(job_id, f"Step: source invoices [company={co}]")
            db = SessionLocal()
            try:
                r = await refresh_invoice_source(db, DATE_FROM, DATE_TO, co)
                _log(job_id, f"  invoices [{co}] → {r.status} ({r.records_processed})")
            finally:
                db.close()

            _log(job_id, f"Step: source deliveries [company={co}]")
            db = SessionLocal()
            try:
                r = await refresh_delivery_source(db, DATE_FROM, DATE_TO, co)
                _log(job_id, f"  deliveries [{co}] → {r.status} ({r.records_processed})")
            finally:
                db.close()

            _log(job_id, f"Step: fact-sales [company={co}]")
            db = SessionLocal()
            try:
                r = rebuild_fact_sales_lines(db, DATE_FROM, DATE_TO, co)
                _log(job_id, f"  fact-sales [{co}] → {r.status} ({r.records_processed})")
            finally:
                db.close()

        # 3. Customer movement
        _log(job_id, "Step: customer-movement (all companies)")
        db = SessionLocal()
        try:
            r = rebuild_customer_product_group_movement(db)
            _log(job_id, f"  customer-movement → {r.status} ({r.records_processed})")
        finally:
            db.close()

        # 4. Stock status
        if include_stock:
            for co in companies:
                if co in COMPANY_LOCATIONS:
                    _log(job_id, f"Step: stock status [company={co}]")
                    db = SessionLocal()
                    try:
                        r = await refresh_stock_status(db, co)
                        _log(job_id, f"  stock [{co}] → {r.status} ({r.records_processed})")
                    finally:
                        db.close()

        job["status"] = "done"
        job["current_step"] = "All done"
        _log(job_id, "=== ALL DONE ===")

    except Exception as exc:
        import traceback
        job["status"] = "error"
        job["error"] = str(exc)
        _log(job_id, f"ERROR: {exc}")
        traceback.print_exc()


@router.post("/full")
async def full_refresh(
    background_tasks: BackgroundTasks,
    companies: str = "all",
    include_stock: bool = True,
):
    """
    Kick off a full Hansa → Neon refresh as a background task.
    Returns a job_id immediately; poll GET /api/refresh/status/{job_id} for progress.

    companies: comma-separated company numbers, or "all" (default: 3,4,5,6)
    include_stock: also refresh ItemStatusVc stock snapshot (default: true)
    """
    cos = ALL_COMPANIES if companies == "all" else [c.strip() for c in companies.split(",")]
    job_id = str(uuid.uuid4())[:8]
    _jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "companies": cos,
        "include_stock": include_stock,
        "current_step": "queued",
        "log": [],
        "started_at": datetime.now(tz=timezone.utc).isoformat(),
    }
    background_tasks.add_task(_run_full_refresh, job_id, cos, include_stock)
    return {"job_id": job_id, "message": "Refresh started", "companies": cos}


@router.get("/status/{job_id}")
def refresh_status(job_id: str):
    """Poll this endpoint to track full refresh progress."""
    job = _jobs.get(job_id)
    if not job:
        return {"error": f"Job {job_id} not found"}
    return job


@router.get("/status")
def list_refresh_jobs():
    """List all recent refresh jobs."""
    return list(_jobs.values())
