"""
Stock status service — fetches ItemStatusVc from Hansa and stores a
fresh snapshot in item_stock_status.  One row per (company_no, art_code, location).

Warehouse → company mapping:
  Co. 3  Retail       → 36RETAIL
  Co. 4  Manufacturing → 38MFG
  Co. 5  Engineering   → 17EFG, 17EWIP
  Co. 6  Mining        → 6MFG
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.hansa_client import HansaClient

logger = logging.getLogger(__name__)

COMPANY_LOCATIONS: dict[str, list[str]] = {
    "3": ["36RETAIL"],
    "4": ["38MFG"],
    "5": ["17EFG", "17EWIP"],
    "6": ["6MFG"],
}

# Field names Hansa uses in ItemStatusVc
_FIELDS = "ArtCode,Location,Instock,OrdOut,POQty,RsrvQty,InShipment,WeighedAvPrice"


@dataclass
class StockRefreshResult:
    status: str
    records_processed: int
    message: str


def _safe_decimal(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


async def refresh_stock_status(
    db: Session,
    company_no: str,
) -> StockRefreshResult:
    """
    Fetches ItemStatusVc for every warehouse assigned to company_no,
    then replaces all rows for that company in item_stock_status.
    """
    locations = COMPANY_LOCATIONS.get(company_no)
    if not locations:
        return StockRefreshResult(
            status="skipped",
            records_processed=0,
            message=f"No warehouse mapping for company {company_no}",
        )

    client = HansaClient(company_no=company_no)

    # Pull item name / group from items table (master data already loaded)
    item_meta: dict[str, dict] = {}
    rows = db.execute(text("""
        SELECT i.code, i.name, i.item_group_code,
               ig.comment AS item_group_name
        FROM items i
        LEFT JOIN item_groups ig
          ON ig.code = i.item_group_code
         AND ig.company_no = i.company_no
        WHERE i.company_no IN ('1', :company_no)
    """), {"company_no": company_no}).mappings().all()
    for r in rows:
        item_meta[r["code"]] = {
            "item_name": r["name"],
            "item_group_code": r["item_group_code"],
            "item_group_name": r["item_group_name"],
        }

    all_records: list[dict] = []

    for location in locations:
        logger.info(f"Fetching ItemStatusVc company={company_no} location={location}")
        try:
            raw = await client.get_item_stock_status(location)
        except Exception as exc:
            logger.warning(f"  Failed {location}: {exc}")
            continue

        for rec in raw:
            # Hansa uses "Code" for the item key (not "ArtCode").
            # Rows with empty Code are warehouse-level totals — skip them.
            art_code = str(rec.get("Code") or "").strip()
            if not art_code:
                continue
            loc = str(rec.get("Location") or location).strip()
            meta = item_meta.get(art_code, {})
            all_records.append({
                "company_no": company_no,
                "art_code": art_code,
                "location": loc,
                "item_name": meta.get("item_name"),
                "item_group_code": meta.get("item_group_code"),
                "item_group_name": meta.get("item_group_name"),
                "instock": _safe_decimal(rec.get("Instock")),
                "ord_out": _safe_decimal(rec.get("OrddOut")),  # double-d in Hansa
                "po_qty": _safe_decimal(rec.get("POQty")),
                "rsrv_qty": _safe_decimal(rec.get("RsrvQty")),
                "in_shipment": _safe_decimal(rec.get("InShipment")),
                "weighed_av_price": _safe_decimal(rec.get("WeighedAvPrice")) or None,
            })
        logger.info(f"  → {len(raw)} rows from {location}")

    if not all_records:
        return StockRefreshResult(
            status="ok",
            records_processed=0,
            message="No records returned from Hansa",
        )

    # Replace wholesale for this company
    fetched_at = datetime.now(tz=timezone.utc)
    db.execute(text("DELETE FROM item_stock_status WHERE company_no = :c"), {"c": company_no})

    db.execute(
        text("""
            INSERT INTO item_stock_status
              (company_no, art_code, location, item_name, item_group_code, item_group_name,
               instock, ord_out, po_qty, rsrv_qty, in_shipment, weighed_av_price, fetched_at)
            VALUES
              (:company_no, :art_code, :location, :item_name, :item_group_code, :item_group_name,
               :instock, :ord_out, :po_qty, :rsrv_qty, :in_shipment, :weighed_av_price, :fetched_at)
            ON CONFLICT (company_no, art_code, location)
            DO UPDATE SET
              item_name        = EXCLUDED.item_name,
              item_group_code  = EXCLUDED.item_group_code,
              item_group_name  = EXCLUDED.item_group_name,
              instock          = EXCLUDED.instock,
              ord_out          = EXCLUDED.ord_out,
              po_qty           = EXCLUDED.po_qty,
              rsrv_qty         = EXCLUDED.rsrv_qty,
              in_shipment      = EXCLUDED.in_shipment,
              weighed_av_price = EXCLUDED.weighed_av_price,
              fetched_at       = EXCLUDED.fetched_at
        """),
        [{**r, "fetched_at": fetched_at} for r in all_records],
    )
    db.commit()

    return StockRefreshResult(
        status="ok",
        records_processed=len(all_records),
        message=f"Refreshed {len(all_records)} stock rows for company {company_no} across {locations}",
    )
