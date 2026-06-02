from datetime import date

from fastapi import APIRouter, Query

from app.services.hansa_client import HansaClient

router = APIRouter(prefix="/api/hansa", tags=["Hansa"])

from app.services.hansa_client import HansaClient

router = APIRouter(prefix="/api/hansa", tags=["Hansa"])


@router.get("/debug-item-groups")
async def debug_item_groups():
    client = HansaClient()
    return await client.debug_item_groups_response()


@router.get("/test-item-groups")
async def test_item_groups():
    client = HansaClient()
    rows = await client.get_item_groups()

    return {
        "count": len(rows),
        "sample": rows[:5],
    }
@router.get("/debug-transactions")
async def debug_transactions(
    date_from: date = Query(...),
    date_to: date = Query(...),
):
    client = HansaClient()

    invoices = await client.get_invoices(date_from.isoformat(), date_to.isoformat())
    deliveries = await client.get_deliveries(date_from.isoformat(), date_to.isoformat())

    first_invoice = invoices[0] if invoices else None
    first_delivery = deliveries[0] if deliveries else None

    return {
        "invoice_count": len(invoices),
        "delivery_count": len(deliveries),
        "invoice_keys": list(first_invoice.keys()) if first_invoice else [],
        "delivery_keys": list(first_delivery.keys()) if first_delivery else [],
        "invoice_sample": first_invoice,
        "delivery_sample": first_delivery,
    }