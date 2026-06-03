"""
Stock status endpoints — serves data from item_stock_status table.
Populated by the stock_service refresh.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.services.stock_service import COMPANY_LOCATIONS, refresh_stock_status
from app.db.database import SessionLocal

router = APIRouter(prefix="/api/stock", tags=["Stock"])


def _co_frag(company_no: str, col: str = "company_no") -> tuple[str, dict]:
    if company_no == "all":
        return f"{col} IN ('3','4','5','6')", {}
    return f"{col} = :company_no", {"company_no": company_no}


@router.get("")
def get_stock(
    company_no: str = Query(default="all"),
    group_code: str | None = Query(default=None),
    search: str | None = Query(default=None),
    min_instock: float | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    Return stock snapshot rows with optional filters.
    Enriched with item name and group from master data.
    """
    co_frag, co_params = _co_frag(company_no, "s.company_no")

    group_filter = "AND s.item_group_code = :group_code" if group_code else ""
    search_filter = "AND (LOWER(s.art_code) LIKE :search OR LOWER(s.item_name) LIKE :search)" if search else ""
    stock_filter = "AND s.instock >= :min_instock" if min_instock is not None else ""

    params = {
        **co_params,
        **({"group_code": group_code} if group_code else {}),
        **({"search": f"%{search.lower()}%"} if search else {}),
        **({"min_instock": min_instock} if min_instock is not None else {}),
    }

    rows = db.execute(text(f"""
        SELECT
            s.company_no,
            s.art_code,
            s.location,
            s.item_name,
            s.item_group_code,
            s.item_group_name,
            s.instock::float          AS instock,
            s.ord_out::float          AS ord_out,
            s.po_qty::float           AS po_qty,
            s.rsrv_qty::float         AS rsrv_qty,
            s.in_shipment::float      AS in_shipment,
            s.weighed_av_price::float AS weighed_av_price,
            s.fetched_at::text        AS fetched_at
        FROM item_stock_status s
        WHERE {co_frag}
          {group_filter}
          {search_filter}
          {stock_filter}
        ORDER BY s.item_group_code NULLS LAST, s.instock DESC, s.art_code
        LIMIT 2000
    """), params).mappings().fetchall()

    return [dict(r) for r in rows]


@router.get("/summary")
def get_stock_summary(
    company_no: str = Query(default="all"),
    db: Session = Depends(get_db),
):
    """Aggregate KPIs for the stock snapshot."""
    co_frag, co_params = _co_frag(company_no)

    row = db.execute(text(f"""
        SELECT
            COUNT(*)                                AS total_items,
            COUNT(*) FILTER (WHERE instock > 0)    AS items_in_stock,
            COUNT(*) FILTER (WHERE instock = 0)    AS items_zero_stock,
            COUNT(*) FILTER (WHERE instock = 0 AND ord_out > 0) AS stockout_with_orders,
            ROUND(SUM(instock)::numeric, 1)         AS total_instock,
            ROUND(SUM(ord_out)::numeric, 1)         AS total_ord_out,
            ROUND(SUM(po_qty)::numeric, 1)          AS total_po_qty,
            ROUND(SUM(in_shipment)::numeric, 1)     AS total_in_shipment,
            MAX(fetched_at)::text                   AS last_fetched_at
        FROM item_stock_status
        WHERE {co_frag}
    """), co_params).mappings().fetchone()

    if not row:
        return {}

    return {k: (float(v) if isinstance(v, (int, float)) else v) for k, v in dict(row).items()}


@router.post("/refresh")
async def trigger_stock_refresh(
    company_no: str = Query(default="all"),
):
    """
    Trigger a live re-fetch of ItemStatusVc from Hansa for the given company.
    Uses a fresh DB session per company to avoid Neon idle-connection timeouts.
    """
    companies = list(COMPANY_LOCATIONS.keys()) if company_no == "all" else [company_no]
    results = []
    for co in companies:
        db = SessionLocal()
        try:
            result = await refresh_stock_status(db, co)
            results.append({"company_no": co, "status": result.status,
                            "records": result.records_processed, "message": result.message})
        except Exception as exc:
            results.append({"company_no": co, "status": "error", "records": 0, "message": str(exc)})
        finally:
            db.close()
    return {"results": results}


@router.get("/debug-probe")
async def debug_stock_probe(
    company_no: str = Query(default="3"),
    location: str = Query(default="36RETAIL"),
):
    """
    Raw probe of the Hansa ItemStatusVc register — returns the first 3 records
    so you can verify field names before a full refresh.
    """
    from app.services.hansa_client import HansaClient
    client = HansaClient(company_no=company_no)
    try:
        records = await client.get_item_stock_status(location)
        return {
            "count": len(records),
            "sample": records[:3],
            "fields": list(records[0].keys()) if records else [],
        }
    except Exception as exc:
        return {"error": str(exc)}
