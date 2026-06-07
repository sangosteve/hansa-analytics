"""
GL accounts refresh service.
Fetches the Chart of Accounts (AccVc register) from the master company (company 1).
GL accounts are dimension data — full replace on each refresh.
Used for revenue, OPEX, gross profit, and margin analytics.
"""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models import GlAccount, RefreshRun
from app.services.hansa_client import HansaClient

MASTER_COMPANY = "1"


def to_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


async def refresh_gl_accounts(db: Session) -> RefreshRun:
    """
    Full replace of GL accounts from the master company (company_no=1).
    Deletes all existing rows for company 1 and re-inserts fresh data.
    """
    refresh_run = RefreshRun(
        company_no=MASTER_COMPANY,
        refresh_type="gl_accounts",
        status="running",
    )
    db.add(refresh_run)
    db.commit()
    db.refresh(refresh_run)

    client = HansaClient(company_no=MASTER_COMPANY)

    try:
        accounts = await client.get_gl_accounts(company_no=MASTER_COMPANY)

        # Full replace for the master company
        db.execute(
            text("DELETE FROM gl_accounts WHERE company_no = :company_no"),
            {"company_no": MASTER_COMPANY},
        )

        rows: list[GlAccount] = []
        skipped = 0

        for acc in accounts:
            acc_number = str(acc.get("AccNumber") or "").strip()
            if not acc_number:
                skipped += 1
                continue

            rows.append(
                GlAccount(
                    company_no=MASTER_COMPANY,
                    acc_number=acc_number,
                    comment=acc.get("Comment") or None,
                    acc_type=to_int(acc.get("AccType")),
                    curncy=acc.get("Curncy") or None,
                    group_acc=acc.get("GroupAcc") or None,
                )
            )

        if rows:
            db.add_all(rows)

        refresh_run.status = "success"
        refresh_run.finished_at = datetime.now(timezone.utc)
        refresh_run.records_processed = len(rows)
        refresh_run.message = (
            f"GL accounts refreshed. company={MASTER_COMPANY} "
            f"Fetched: {len(accounts)}. Stored: {len(rows)}. Skipped: {skipped}."
        )
        db.commit()
        db.refresh(refresh_run)
        return refresh_run

    except Exception as error:
        db.rollback()
        failed = db.get(RefreshRun, refresh_run.id)
        if failed:
            failed.status = "failed"
            failed.finished_at = datetime.now(timezone.utc)
            failed.message = str(error)
            db.commit()
            db.refresh(failed)
            return failed
        raise
