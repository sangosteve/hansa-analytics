"""
APScheduler service for automatic scheduled data refreshes.

Reads the schedule config from the DB on each run so that
changes in Settings take effect on the next scheduled job
without requiring a server restart.
"""

import asyncio
import logging
import uuid
from datetime import date, datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import desc

from app.db.database import SessionLocal
from app.db.models import RefreshJob, RefreshSettings

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None

SCHEDULED_JOB_ID = "hansa_daily_refresh"


def _get_settings_and_date_range():
    """Read current settings from DB and compute the refresh date range."""
    from app.db.models import RefreshRun

    db = SessionLocal()
    try:
        cfg = db.get(RefreshSettings, 1)
        if cfg is None:
            return None, None, None

        today = date.today()
        if cfg.refresh_mode == "last_success_buffer":
            last_run = (
                db.query(RefreshJob)
                .filter(RefreshJob.status == "done")
                .order_by(desc(RefreshJob.finished_at))
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

        return cfg, date_from, today
    finally:
        db.close()


async def run_scheduled_refresh():
    """Entry point called by APScheduler. Reads config, runs full pipeline."""
    from app.api.routes_refresh import _run_pipeline, _init_job

    logger.info("Scheduled refresh triggered")

    cfg, date_from, date_to = _get_settings_and_date_range()
    if cfg is None:
        logger.warning("Scheduled refresh: no settings found, skipping")
        return

    if not cfg.schedule_enabled:
        logger.info("Scheduled refresh: disabled in settings, skipping")
        return

    companies = cfg.active_companies or ["3", "4", "5", "6"]
    job_id = f"sched-{str(uuid.uuid4())[:8]}"

    _init_job(job_id, companies, date_from, date_to, "scheduled")

    logger.info(
        "Scheduled refresh starting: job_id=%s companies=%s %s → %s",
        job_id, companies, date_from, date_to,
    )

    await _run_pipeline(
        job_id=job_id,
        companies=companies,
        date_from=date_from,
        date_to=date_to,
        include_master=cfg.include_master,
        include_invoices=cfg.include_invoices,
        include_deliveries=cfg.include_deliveries,
        include_orders=cfg.include_orders,
        include_receipts=cfg.include_receipts,
        include_gl_accounts=cfg.include_gl_accounts,
        rebuild_facts=cfg.rebuild_facts,
        rebuild_movement=cfg.rebuild_movement,
        rebuild_stock=cfg.rebuild_stock,
        trigger_type="scheduled",
    )

    logger.info("Scheduled refresh complete: job_id=%s", job_id)


def _parse_cron_time(time_str: str):
    """Parse 'HH:MM' → (hour, minute) ints."""
    try:
        parts = time_str.strip().split(":")
        return int(parts[0]), int(parts[1])
    except Exception:
        return 2, 0


def reschedule(cfg: RefreshSettings):
    """
    Update the APScheduler job to match the current settings.
    Called on startup and whenever settings are saved.
    """
    global _scheduler
    if _scheduler is None:
        return

    if not cfg.schedule_enabled:
        if _scheduler.get_job(SCHEDULED_JOB_ID):
            _scheduler.remove_job(SCHEDULED_JOB_ID)
            logger.info("Scheduler: job removed (disabled)")
        return

    hour, minute = _parse_cron_time(cfg.schedule_time)

    if cfg.schedule_frequency == "daily":
        trigger = CronTrigger(hour=hour, minute=minute, timezone="UTC")
    elif cfg.schedule_frequency == "weekly":
        trigger = CronTrigger(day_of_week="mon", hour=hour, minute=minute, timezone="UTC")
    elif cfg.schedule_frequency == "monthly":
        trigger = CronTrigger(day=1, hour=hour, minute=minute, timezone="UTC")
    else:
        trigger = CronTrigger(hour=hour, minute=minute, timezone="UTC")

    if _scheduler.get_job(SCHEDULED_JOB_ID):
        _scheduler.reschedule_job(SCHEDULED_JOB_ID, trigger=trigger)
        logger.info("Scheduler: rescheduled to %s at %02d:%02d UTC", cfg.schedule_frequency, hour, minute)
    else:
        _scheduler.add_job(
            run_scheduled_refresh,
            trigger=trigger,
            id=SCHEDULED_JOB_ID,
            replace_existing=True,
        )
        logger.info("Scheduler: job added — %s at %02d:%02d UTC", cfg.schedule_frequency, hour, minute)


def start_scheduler():
    """Start APScheduler and apply current settings from DB."""
    global _scheduler
    _scheduler = AsyncIOScheduler()
    _scheduler.start()
    logger.info("APScheduler started")

    db = SessionLocal()
    try:
        cfg = db.get(RefreshSettings, 1)
        if cfg:
            reschedule(cfg)
        else:
            logger.info("Scheduler: no settings row found yet — job will be added when settings are saved")
    finally:
        db.close()


def stop_scheduler():
    """Gracefully stop APScheduler."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")
