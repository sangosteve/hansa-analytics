"""
Fact sales lines rebuild service.

Key business rules implemented here:

Flow 1  Quote → Invoice (invoice updates stock)
  - Hansa API already filters to UpdStockFlag=1 invoices
  - Line-level: exclude rows where not_upd_stock_flag=1 (line does not update stock)
  - Salesperson comes from invoice header

Flow 2  Sales Order → Invoice → Delivery (delivery updates stock)
  - The delivery updates stock; the invoice does NOT (invoice UpdStockFlag=0,
    which the API filter already excludes — so no double-counting at header level)
  - Salesperson must come from the linked invoice using delivery.order_nr
  - If no matching invoice found, salesperson = 'Unassigned'

Double-counting is prevented because:
  - Invoices in the DB all have UpdStockFlag=1 (API filter)
  - For Flow 2 the UpdStockFlag=0 invoice is excluded at API fetch time
  - Deliveries always update stock, so counting them is correct
"""

from datetime import date, datetime, timezone

from sqlalchemy import and_, delete, func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import FactSalesLine, RefreshRun


def rebuild_fact_sales_lines(
    db: Session,
    date_from: date,
    date_to: date,
    company_no: str | None = None,
    master_company_no: str | None = None,
) -> RefreshRun:
    company_no = company_no or settings.hansa_company_no
    master_company_no = master_company_no or settings.hansa_master_company_no

    refresh_run = RefreshRun(
        company_no=company_no,
        refresh_type="fact_sales_lines",
        status="running",
        date_from=date_from,
        date_to=date_to,
    )

    db.add(refresh_run)
    db.commit()
    db.refresh(refresh_run)

    try:
        # Range reload: clear fact rows for this company + period, then rebuild.
        db.execute(
            delete(FactSalesLine).where(
                and_(
                    FactSalesLine.company_no == company_no,
                    FactSalesLine.transaction_date >= date_from,
                    FactSalesLine.transaction_date <= date_to,
                )
            )
        )

        insert_sql = text("""
            INSERT INTO fact_sales_lines (
                company_no, transaction_date, source_type,
                source_no, source_row_no, source_row_hash, order_no,
                customer_code, customer_name, item_code, item_name,
                item_group_code, item_group_name, location, salesperson,
                quantity, item_weight, unit_coefficient, tonnes,
                pay_deal, credit_mark, invoice_type, created_at
            )

            -- ── INVOICE SIDE (Flow 1: invoice updates stock) ──────────────────
            SELECT
                ih.company_no,
                ih.inv_date                                    AS transaction_date,
                'invoice'                                      AS source_type,
                ih.ser_nr                                      AS source_no,
                il.row_number                                  AS source_row_no,
                il.source_row_hash,
                ih.order_no,
                ih.cust_code                                   AS customer_code,
                c.name                                         AS customer_name,
                il.art_code                                    AS item_code,
                i.name                                         AS item_name,
                i.item_group_code,
                ig.comment                                     AS item_group_name,
                COALESCE(NULLIF(il.location, ''), ih.location) AS location,
                ih.sales_man                                   AS salesperson,
                il.quant                                       AS quantity,
                i.weight                                       AS item_weight,
                i.unit_coefficient,
                CASE
                    WHEN ih.pay_deal = 'CN'
                    THEN -1 * il.quant * COALESCE(i.unit_coefficient, 0) / 1000
                    ELSE       il.quant * COALESCE(i.unit_coefficient, 0) / 1000
                END                                            AS tonnes,
                ih.pay_deal,
                ih.cred_mark                                   AS credit_mark,
                ih.inv_type                                    AS invoice_type,
                now()                                          AS created_at

            FROM hansa_invoice_headers ih
            JOIN hansa_invoice_lines il
              ON il.company_no = ih.company_no
             AND il.ser_nr     = ih.ser_nr
            LEFT JOIN customers c
              ON c.company_no = :master_company_no
             AND c.code       = ih.cust_code
            LEFT JOIN LATERAL (
                SELECT item.*
                FROM items item
                WHERE item.company_no = :master_company_no
                  AND (item.code = il.art_code OR item.alternative_code = il.art_code)
                ORDER BY CASE WHEN item.code = il.art_code THEN 0 ELSE 1 END
                LIMIT 1
            ) i ON true
            LEFT JOIN item_groups ig
              ON ig.company_no = :master_company_no
             AND ig.code       = i.item_group_code

            WHERE ih.company_no  = :company_no
              AND ih.inv_date    >= :date_from
              AND ih.inv_date    <= :date_to
              AND il.art_code IS NOT NULL
              AND il.art_code    <> ''
              -- Exclude lines that do not update stock (line-level override)
              AND (il.not_upd_stock_flag IS NULL OR il.not_upd_stock_flag = 0)

            UNION ALL

            -- ── DELIVERY SIDE (Flow 2: delivery updates stock) ───────────────
            SELECT
                dh.company_no,
                dh.ship_date                                   AS transaction_date,
                'delivery'                                     AS source_type,
                dh.ser_nr                                      AS source_no,
                dl.row_number                                  AS source_row_no,
                dl.source_row_hash,
                dh.order_nr                                    AS order_no,
                dh.cust_code                                   AS customer_code,
                c.name                                         AS customer_name,
                dl.art_code                                    AS item_code,
                i.name                                         AS item_name,
                i.item_group_code,
                ig.comment                                     AS item_group_name,
                COALESCE(NULLIF(dl.location, ''), dh.location) AS location,

                -- Salesperson attribution: link delivery → invoice via order_nr.
                -- The invoice for the same Sales Order carries the salesperson.
                -- Fall back to 'Unassigned' when no match is found.
                COALESCE(
                    NULLIF(TRIM(
                        (SELECT ih2.sales_man
                         FROM hansa_invoice_headers ih2
                         WHERE ih2.company_no  = dh.company_no
                           AND ih2.order_no    = dh.order_nr
                           AND ih2.order_no IS NOT NULL
                           AND ih2.order_no    <> ''
                           AND ih2.sales_man IS NOT NULL
                           AND ih2.sales_man   <> ''
                         LIMIT 1)
                    ), ''),
                    'Unassigned'
                )                                              AS salesperson,

                dl.ship                                        AS quantity,
                i.weight                                       AS item_weight,
                i.unit_coefficient,
                dl.ship * COALESCE(i.unit_coefficient, 0) / 1000 AS tonnes,
                NULL                                           AS pay_deal,
                NULL                                           AS credit_mark,
                NULL                                           AS invoice_type,
                now()                                          AS created_at

            FROM hansa_delivery_headers dh
            JOIN hansa_delivery_lines dl
              ON dl.company_no = dh.company_no
             AND dl.ser_nr     = dh.ser_nr
            LEFT JOIN customers c
              ON c.company_no = :master_company_no
             AND c.code       = dh.cust_code
            LEFT JOIN LATERAL (
                SELECT item.*
                FROM items item
                WHERE item.company_no = :master_company_no
                  AND (item.code = dl.art_code OR item.alternative_code = dl.art_code)
                ORDER BY CASE WHEN item.code = dl.art_code THEN 0 ELSE 1 END
                LIMIT 1
            ) i ON true
            LEFT JOIN item_groups ig
              ON ig.company_no = :master_company_no
             AND ig.code       = i.item_group_code

            WHERE dh.company_no  = :company_no
              AND dh.ship_date   >= :date_from
              AND dh.ship_date   <= :date_to
              AND dl.art_code IS NOT NULL
              AND dl.art_code    <> '';
        """)

        db.execute(
            insert_sql,
            {
                "company_no": company_no,
                "master_company_no": master_company_no,
                "date_from": date_from,
                "date_to": date_to,
            },
        )

        # Count breakdown for the run log
        count_query = text("""
            SELECT
                source_type,
                COUNT(*)              AS rows,
                SUM(tonnes)           AS tonnes,
                COUNT(CASE WHEN salesperson IS NOT NULL AND salesperson <> ''
                            AND salesperson <> 'Unassigned' THEN 1 END) AS with_rep,
                COUNT(CASE WHEN salesperson = 'Unassigned' THEN 1 END) AS unassigned
            FROM fact_sales_lines
            WHERE company_no       = :company_no
              AND transaction_date >= :date_from
              AND transaction_date <= :date_to
            GROUP BY source_type
        """)
        count_rows = db.execute(
            count_query,
            {"company_no": company_no, "date_from": date_from, "date_to": date_to},
        ).mappings().fetchall()

        total = sum(int(r["rows"]) for r in count_rows)
        summary_parts = []
        for r in count_rows:
            t = float(r["tonnes"] or 0)
            msg = f"{r['source_type']}: {r['rows']} rows / {t:.1f}t"
            if r["source_type"] == "delivery":
                msg += f" (rep attributed: {r['with_rep']}, unassigned: {r['unassigned']})"
            summary_parts.append(msg)

        refresh_run.status = "success"
        refresh_run.finished_at = datetime.now(timezone.utc)
        refresh_run.records_processed = total
        refresh_run.message = (
            f"Fact sales rebuilt. company={company_no} | "
            + " | ".join(summary_parts)
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
