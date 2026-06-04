"""
Stock status endpoints — serves data from item_stock_status table.
Populated by the stock_service refresh.
Supports company_nos (multi-select).
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.filters import build_company_filter
from app.db.database import get_db
from app.services.stock_service import COMPANY_LOCATIONS, refresh_stock_status
from app.db.database import SessionLocal

router = APIRouter(prefix="/api/stock", tags=["Stock"])


@router.get("/status")
@router.get("")
def get_stock(
    company_nos: Optional[list[str]] = Query(default=None),
    company_no: str = Query(default="all"),
    group_code: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    min_instock: Optional[float] = Query(default=None),
    db: Session = Depends(get_db),
):
    resolved = company_nos or [company_no]
    co_frag, co_params = build_company_filter(resolved, "s.company_no")

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
    company_nos: Optional[list[str]] = Query(default=None),
    company_no: str = Query(default="all"),
    db: Session = Depends(get_db),
):
    resolved = company_nos or [company_no]
    co_frag, co_params = build_company_filter(resolved)

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
    company_nos: Optional[list[str]] = Query(default=None),
    company_no: str = Query(default="all"),
):
    resolved = company_nos or [company_no]
    if not resolved or "all" in resolved:
        companies = list(COMPANY_LOCATIONS.keys())
    else:
        companies = [c for c in resolved if c in COMPANY_LOCATIONS]

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
