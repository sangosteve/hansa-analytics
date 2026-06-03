"""
Refresh routes — trigger Hansa data pulls and fact rebuilds.

All transaction endpoints accept an optional company_no in the request body,
defaulting to the HANSA_COMPANY_NO environment variable when omitted.
This enables multi-company refresh (3, 4, 5, 6) without separate deployments.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.refresh import MasterDataRefreshRequest, TransactionRefreshRequest
from app.services.fact_sales_service import rebuild_fact_sales_lines
from app.services.master_data_service import refresh_master_data
from app.services.movement_service import rebuild_customer_product_group_movement
from app.services.source_delivery_service import refresh_delivery_source
from app.services.source_invoice_service import refresh_invoice_source
from app.services.transaction_service import refresh_transactions

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
