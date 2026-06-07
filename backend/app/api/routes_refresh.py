"""
Refresh routes — trigger Hansa data pulls and fact rebuilds.

Endpoints:
  GET  /api/refresh/settings          — get refresh configuration (includes schedule)
  PUT  /api/refresh/settings          — update refresh configuration
  POST /api/refresh/default           — run default refresh (all active companies, smart date range)
  POST /api/refresh/custom            — run custom refresh with full payload control
  GET  /api/refresh/status/{job_id}   — poll job progress
  GET  /api/refresh/status            — list recent jobs
  GET  /api/refresh/history           — job-level history from refresh_jobs table
  GET  /api/refresh/freshness         — data freshness indicator for dashboard

  (legacy endpoints kept for backward compatibility)
"""

import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db.database import SessionLocal, get_db
from app.db.models import RefreshJob, RefreshRun, RefreshSettings
from app.schemas.refresh import (
    CustomRefreshRequest,
    MasterDataRefreshRequest,
    RefreshSettingsSchema,
    TransactionRefreshRequest,
)
from app.services.fact_sales_service import rebuild_fact_sales_lines
from app.services.master_data_service import refresh_master_data
from app.services.movement_service import rebuild_customer_product_group_movement
from app.services.source_delivery_service import refresh_delivery_source
from app.services.source_invoice_service import refresh_invoice_source
from app.services.stock_service import COMPANY_LOCATIONS, refresh_stock_status
from app.services.transaction_service import refresh_transactions

router = APIRouter(prefix="/api/refresh", tags=["Refresh"])

# ── In-memory job tracker ─────────────────────────────────────────────────────
_jobs: dict[str, dict] = {}

ALL_COMPANIES = ["3", "4", "5", "6"]
COMPANY_LABELS = {"3": "Retail", "4": "Manufacturing", "5": "Engineering", "6": "Mining"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def serialize_refresh_run(refresh_run):
    return {
        "id": refresh_run.id,
        "company_no": refresh_run.company_no,
        "status": refresh_run.status,
        "message": refresh_run.message,
        "records_processed": refresh_run.records_processed,
        "date_from": str(refresh_run.date_from) if refresh_run.date_from else None,
        "date_to": str(refresh_run.date_to) if refresh_run.date_to else None,
        "started_at": refresh_run.started_at.isoformat() if refresh_run.started_at else None,
        "finished_at": refresh_run.finished_at.isoformat() if refresh_run.finished_at else None,
    }


def _serialize_refresh_job(job: RefreshJob) -> dict:
    started = job.started_at
    finished = job.finished_at
    duration_secs = None
    if started and finished:
        duration_secs = round((finished - started).total_seconds())
    return {
        "id": job.id,
        "job_id": job.job_id,
        "trigger_type": job.trigger_type,
        "status": job.status,
        "companies": job.companies,
        "date_from": str(job.date_from) if job.date_from else None,
        "date_to": str(job.date_to) if job.date_to else None,
        "started_at": started.isoformat() if started else None,
        "finished_at": finished.isoformat() if finished else None,
        "duration_secs": duration_secs,
        "total_records": job.total_records,
        "step_count": job.step_count,
        "error_count": job.error_count,
        "error_message": job.error_message,
    }


def _get_or_create_settings(db: Session) -> RefreshSettings:
    row = db.get(RefreshSettings, 1)
    if row is None:
        row = RefreshSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _calculate_date_range(db: Session, cfg: RefreshSettings) -> tuple[date, date]:
    today = date.today()

    if cfg.refresh_mode == "last_success_buffer":
        last_job = (
            db.query(RefreshJob)
            .filter(RefreshJob.status == "done", RefreshJob.date_to.isnot(None))
            .order_by(desc(RefreshJob.finished_at))
            .first()
        )
        if last_job and last_job.date_to:
            date_from = last_job.date_to - timedelta(days=cfg.safety_buffer_days)
        else:
            # Fall back to legacy RefreshRun table
            last_run = (
                db.query(RefreshRun)
                .filter(RefreshRun.status == "success", RefreshRun.date_to.isnot(None))
                .order_by(desc(RefreshRun.finished_at))
                .first()
            )
            if last_run and last_run.date_to:
                date_from = last_run.date_to - timedelta(days=cfg.safety_buffer_days)
            else:
                date_from = today.replace(day=1)

    elif cfg.refresh_mode == "last_n_days":
        date_from = today - timedelta(days=cfg.last_n_days)

    elif cfg.refresh_mode == "current_month":
        date_from = today.replace(day=1)

    elif cfg.refresh_mode == "ytd":
        date_from = today.replace(month=1, day=1)

    else:
        date_from = today.replace(day=1)

    return date_from, today


def _init_job(job_id: str, companies: List[str], date_from: date, date_to: date, mode: str) -> dict:
    job: dict = {
        "job_id": job_id,
        "status": "queued",
        "mode": mode,
        "companies": companies,
        "date_from": str(date_from),
        "date_to": str(date_to),
        "current_step": "Queued",
        "steps": [],
        "log": [],
        "started_at": datetime.now(tz=timezone.utc).isoformat(),
        "finished_at": None,
        "error": None,
    }
    _jobs[job_id] = job
    return job


def _log(job_id: str, msg: str):
    job = _jobs.get(job_id)
    if job:
        ts = datetime.now(tz=timezone.utc).strftime("%H:%M:%S")
        job["log"].append(f"[{ts}] {msg}")
        job["current_step"] = msg
    print(msg, flush=True)


def _add_step(job_id: str, company: str, step: str, status: str, records: int = 0, message: str = ""):
    job = _jobs.get(job_id)
    if not job:
        return
    job["steps"].append({
        "company": company,
        "company_label": COMPANY_LABELS.get(company, company),
        "step": step,
        "status": status,
        "records": records,
        "message": message,
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
    })


def _save_refresh_job(job_id: str, trigger_type: str, companies: list, date_from: date, date_to: date):
    """Create the RefreshJob record in DB when a pipeline starts."""
    db = SessionLocal()
    try:
        rj = RefreshJob(
            job_id=job_id,
            trigger_type=trigger_type,
            status="running",
            companies=companies,
            date_from=date_from,
            date_to=date_to,
            started_at=datetime.now(timezone.utc),
        )
        db.add(rj)
        db.commit()
    except Exception as e:
        print(f"[refresh_job] Failed to create DB record: {e}", flush=True)
        db.rollback()
    finally:
        db.close()


def _update_refresh_job(job_id: str, status: str, total_records: int, step_count: int, error_count: int, error_message: str | None = None):
    """Update the RefreshJob record when a pipeline finishes."""
    db = SessionLocal()
    try:
        rj = db.query(RefreshJob).filter(RefreshJob.job_id == job_id).first()
        if rj:
            rj.status = status
            rj.finished_at = datetime.now(timezone.utc)
            rj.total_records = total_records
            rj.step_count = step_count
            rj.error_count = error_count
            rj.error_message = error_message
            db.commit()
    except Exception as e:
        print(f"[refresh_job] Failed to update DB record: {e}", flush=True)
        db.rollback()
    finally:
        db.close()


# ── Core refresh pipeline ─────────────────────────────────────────────────────

async def _run_pipeline(
    job_id: str,
    companies: List[str],
    date_from: date,
    date_to: date,
    include_master: bool,
    include_invoices: bool,
    include_deliveries: bool,
    rebuild_facts: bool,
    rebuild_movement: bool,
    rebuild_stock: bool,
    trigger_type: str = "manual",
):
    job = _jobs[job_id]
    job["status"] = "running"
    job["trigger_type"] = trigger_type

    _save_refresh_job(job_id, trigger_type, companies, date_from, date_to)

    try:
        # ── Master data ───────────────────────────────────────────────────────
        if include_master:
            _log(job_id, "Refreshing master data (items, customers)...")
            db = SessionLocal()
            try:
                r = await refresh_master_data(db)
                _add_step(job_id, "all", "master_data", r.status, r.records_processed, r.message or "")
                _log(job_id, f"  master-data → {r.status} ({r.records_processed} records)")
            except Exception as e:
                _add_step(job_id, "all", "master_data", "error", 0, str(e))
                _log(job_id, f"  master-data ERROR: {e}")
            finally:
                db.close()

        # ── Per-company pipeline ──────────────────────────────────────────────
        for co in companies:
            label = COMPANY_LABELS.get(co, f"Company {co}")

            if include_invoices:
                _log(job_id, f"Refreshing invoices [{label}]...")
                db = SessionLocal()
                try:
                    r = await refresh_invoice_source(db, date_from, date_to, co)
                    _add_step(job_id, co, "invoices", r.status, r.records_processed, r.message or "")
                    _log(job_id, f"  invoices [{label}] → {r.status} ({r.records_processed})")
                except Exception as e:
                    _add_step(job_id, co, "invoices", "error", 0, str(e))
                    _log(job_id, f"  invoices [{label}] ERROR: {e}")
                finally:
                    db.close()

            if include_deliveries:
                _log(job_id, f"Refreshing deliveries [{label}]...")
                db = SessionLocal()
                try:
                    r = await refresh_delivery_source(db, date_from, date_to, co)
                    _add_step(job_id, co, "deliveries", r.status, r.records_processed, r.message or "")
                    _log(job_id, f"  deliveries [{label}] → {r.status} ({r.records_processed})")
                except Exception as e:
                    _add_step(job_id, co, "deliveries", "error", 0, str(e))
                    _log(job_id, f"  deliveries [{label}] ERROR: {e}")
                finally:
                    db.close()

            if rebuild_facts:
                _log(job_id, f"Rebuilding sales facts [{label}]...")
                db = SessionLocal()
                try:
                    r = rebuild_fact_sales_lines(db, date_from, date_to, co)
                    _add_step(job_id, co, "fact_sales", r.status, r.records_processed, r.message or "")
                    _log(job_id, f"  fact-sales [{label}] → {r.status} ({r.records_processed})")
                except Exception as e:
                    _add_step(job_id, co, "fact_sales", "error", 0, str(e))
                    _log(job_id, f"  fact-sales [{label}] ERROR: {e}")
                finally:
                    db.close()

        # ── Customer movement ─────────────────────────────────────────────────
        if rebuild_movement:
            _log(job_id, "Rebuilding customer movement...")
            db = SessionLocal()
            try:
                r = rebuild_customer_product_group_movement(db)
                _add_step(job_id, "all", "customer_movement", r.status, r.records_processed, r.message or "")
                _log(job_id, f"  customer-movement → {r.status} ({r.records_processed})")
            except Exception as e:
                _add_step(job_id, "all", "customer_movement", "error", 0, str(e))
                _log(job_id, f"  customer-movement ERROR: {e}")
            finally:
                db.close()

        # ── Stock status ──────────────────────────────────────────────────────
        if rebuild_stock:
            for co in companies:
                if co not in COMPANY_LOCATIONS:
                    continue
                label = COMPANY_LABELS.get(co, f"Company {co}")
                _log(job_id, f"Refreshing stock status [{label}]...")
                db = SessionLocal()
                try:
                    r = await refresh_stock_status(db, co)
                    _add_step(job_id, co, "stock", r.status, r.records_processed, r.message or "")
                    _log(job_id, f"  stock [{label}] → {r.status} ({r.records_processed})")
                except Exception as e:
                    _add_step(job_id, co, "stock", "error", 0, str(e))
                    _log(job_id, f"  stock [{label}] ERROR: {e}")
                finally:
                    db.close()

        # ── Done ──────────────────────────────────────────────────────────────
        has_errors = any(s["status"] == "error" for s in job["steps"])
        final_status = "error" if has_errors else "done"
        job["status"] = final_status
        job["finished_at"] = datetime.now(tz=timezone.utc).isoformat()
        job["current_step"] = "Completed with errors" if has_errors else "All done"
        _log(job_id, "=== REFRESH COMPLETE ===")

        total_records = sum(s.get("records", 0) for s in job["steps"])
        error_count = sum(1 for s in job["steps"] if s["status"] == "error")
        _update_refresh_job(job_id, final_status, total_records, len(job["steps"]), error_count)

    except Exception as exc:
        import traceback
        job["status"] = "error"
        job["error"] = str(exc)
        job["finished_at"] = datetime.now(tz=timezone.utc).isoformat()
        job["current_step"] = f"Failed: {exc}"
        _log(job_id, f"FATAL ERROR: {exc}")
        traceback.print_exc()
        _update_refresh_job(job_id, "error", 0, len(job.get("steps", [])), 1, str(exc))


# ── Settings endpoints ────────────────────────────────────────────────────────

@router.get("/settings")
def get_refresh_settings(db: Session = Depends(get_db)):
    cfg = _get_or_create_settings(db)
    return {
        "active_companies": cfg.active_companies,
        "refresh_mode": cfg.refresh_mode,
        "safety_buffer_days": cfg.safety_buffer_days,
        "last_n_days": cfg.last_n_days,
        "include_master": cfg.include_master,
        "include_invoices": cfg.include_invoices,
        "include_deliveries": cfg.include_deliveries,
        "rebuild_facts": cfg.rebuild_facts,
        "rebuild_movement": cfg.rebuild_movement,
        "rebuild_stock": cfg.rebuild_stock,
        "schedule_enabled": cfg.schedule_enabled,
        "schedule_frequency": cfg.schedule_frequency,
        "schedule_time": cfg.schedule_time,
        "updated_at": cfg.updated_at.isoformat() if cfg.updated_at else None,
    }


@router.put("/settings")
def update_refresh_settings(payload: RefreshSettingsSchema, db: Session = Depends(get_db)):
    cfg = _get_or_create_settings(db)
    cfg.active_companies = payload.active_companies
    cfg.refresh_mode = payload.refresh_mode
    cfg.safety_buffer_days = payload.safety_buffer_days
    cfg.last_n_days = payload.last_n_days
    cfg.include_master = payload.include_master
    cfg.include_invoices = payload.include_invoices
    cfg.include_deliveries = payload.include_deliveries
    cfg.rebuild_facts = payload.rebuild_facts
    cfg.rebuild_movement = payload.rebuild_movement
    cfg.rebuild_stock = payload.rebuild_stock
    cfg.schedule_enabled = payload.schedule_enabled
    cfg.schedule_frequency = payload.schedule_frequency
    cfg.schedule_time = payload.schedule_time
    cfg.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(cfg)

    # Update APScheduler with new settings
    try:
        from app.services.scheduler_service import reschedule
        reschedule(cfg)
    except Exception as e:
        print(f"[scheduler] Failed to reschedule after settings update: {e}", flush=True)

    return {"status": "ok", "message": "Settings saved"}


# ── Data freshness indicator ──────────────────────────────────────────────────

@router.get("/freshness")
def get_freshness(db: Session = Depends(get_db)):
    """Return the most recent successful refresh for the dashboard freshness badge."""
    last_job = (
        db.query(RefreshJob)
        .filter(RefreshJob.status == "done")
        .order_by(desc(RefreshJob.finished_at))
        .first()
    )

    now = datetime.now(timezone.utc)

    if last_job and last_job.finished_at:
        finished = last_job.finished_at
        if finished.tzinfo is None:
            finished = finished.replace(tzinfo=timezone.utc)
        hours_ago = (now - finished).total_seconds() / 3600

        if hours_ago < 26:
            status = "ok"
        elif hours_ago < 50:
            status = "stale"
        else:
            status = "overdue"

        return {
            "last_refresh": finished.isoformat(),
            "hours_ago": round(hours_ago, 1),
            "status": status,
            "trigger_type": last_job.trigger_type,
            "companies": last_job.companies,
        }

    # Check legacy RefreshRun table too
    last_run = (
        db.query(RefreshRun)
        .filter(RefreshRun.status == "success")
        .order_by(desc(RefreshRun.finished_at))
        .first()
    )
    if last_run and last_run.finished_at:
        finished = last_run.finished_at
        if finished.tzinfo is None:
            finished = finished.replace(tzinfo=timezone.utc)
        hours_ago = (now - finished).total_seconds() / 3600
        status = "ok" if hours_ago < 26 else ("stale" if hours_ago < 50 else "overdue")
        return {
            "last_refresh": finished.isoformat(),
            "hours_ago": round(hours_ago, 1),
            "status": status,
            "trigger_type": "manual",
            "companies": [],
        }

    return {
        "last_refresh": None,
        "hours_ago": None,
        "status": "unknown",
        "trigger_type": None,
        "companies": [],
    }


# ── Default refresh ───────────────────────────────────────────────────────────

@router.post("/default")
async def default_refresh(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Run the default refresh using saved settings.
    Refreshes all active companies over the configured date range.
    """
    cfg = _get_or_create_settings(db)
    companies = cfg.active_companies or ALL_COMPANIES
    date_from, date_to = _calculate_date_range(db, cfg)

    job_id = str(uuid.uuid4())[:8]
    _init_job(job_id, companies, date_from, date_to, "default")

    background_tasks.add_task(
        _run_pipeline,
        job_id,
        companies,
        date_from,
        date_to,
        cfg.include_master,
        cfg.include_invoices,
        cfg.include_deliveries,
        cfg.rebuild_facts,
        cfg.rebuild_movement,
        cfg.rebuild_stock,
        "manual",
    )

    return {
        "job_id": job_id,
        "status": "queued",
        "companies": companies,
        "date_from": str(date_from),
        "date_to": str(date_to),
        "mode": "default",
        "message": f"Default refresh started for {len(companies)} companies ({date_from} → {date_to})",
    }


# ── Custom refresh ────────────────────────────────────────────────────────────

@router.post("/custom")
async def custom_refresh(payload: CustomRefreshRequest, background_tasks: BackgroundTasks):
    """
    Run a custom refresh with full control over companies, date range, and components.
    """
    companies = payload.company_nos or ALL_COMPANIES
    job_id = str(uuid.uuid4())[:8]
    _init_job(job_id, companies, payload.date_from, payload.date_to, "custom")

    background_tasks.add_task(
        _run_pipeline,
        job_id,
        companies,
        payload.date_from,
        payload.date_to,
        payload.include_master,
        payload.include_invoices,
        payload.include_deliveries,
        payload.rebuild_facts,
        payload.rebuild_movement,
        payload.rebuild_stock,
        "manual",
    )

    return {
        "job_id": job_id,
        "status": "queued",
        "companies": companies,
        "date_from": str(payload.date_from),
        "date_to": str(payload.date_to),
        "mode": "custom",
        "message": f"Custom refresh started for {companies}",
    }


# ── Job status ────────────────────────────────────────────────────────────────

@router.get("/status/{job_id}")
def refresh_status(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        return {"error": f"Job {job_id} not found"}
    return job


@router.get("/status")
def list_refresh_jobs():
    return list(_jobs.values())


# ── Refresh history from DB ───────────────────────────────────────────────────

@router.get("/history")
def refresh_history(limit: int = 100, db: Session = Depends(get_db)):
    """Return job-level history from refresh_jobs table."""
    jobs = (
        db.query(RefreshJob)
        .order_by(desc(RefreshJob.started_at))
        .limit(limit)
        .all()
    )
    return [_serialize_refresh_job(j) for j in jobs]


# ── Legacy full-refresh endpoint (kept for backward compatibility) ─────────────

DATE_FROM_LEGACY = date(2024, 1, 1)
DATE_TO_LEGACY   = date(2026, 6, 4)


@router.post("/full")
async def full_refresh(
    background_tasks: BackgroundTasks,
    companies: str = "all",
    include_stock: bool = True,
):
    """
    Legacy endpoint. Prefer /api/refresh/default or /api/refresh/custom.
    Kick off a full Hansa → Neon refresh as a background task.
    """
    cos = ALL_COMPANIES if companies == "all" else [c.strip() for c in companies.split(",")]
    job_id = str(uuid.uuid4())[:8]
    _init_job(job_id, cos, DATE_FROM_LEGACY, DATE_TO_LEGACY, "full_legacy")

    background_tasks.add_task(
        _run_pipeline,
        job_id,
        cos,
        DATE_FROM_LEGACY,
        DATE_TO_LEGACY,
        True,   # include_master
        True,   # include_invoices
        True,   # include_deliveries
        True,   # rebuild_facts
        True,   # rebuild_movement
        include_stock,
        "manual",
    )
    return {"job_id": job_id, "message": "Refresh started", "companies": cos}


# ── Granular legacy endpoints ─────────────────────────────────────────────────

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
    company_no = payload.resolved_company_no()
    invoice_refresh = await refresh_invoice_source(
        db=db, date_from=payload.date_from, date_to=payload.date_to, company_no=company_no,
    )
    delivery_refresh = await refresh_delivery_source(
        db=db, date_from=payload.date_from, date_to=payload.date_to, company_no=company_no,
    )
    fact_refresh = rebuild_fact_sales_lines(
        db=db, date_from=payload.date_from, date_to=payload.date_to, company_no=company_no,
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
