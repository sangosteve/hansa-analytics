from datetime import date, datetime, timezone

from sqlalchemy import and_, delete, func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import FactSalesLine, RefreshRun


def rebuild_fact_sales_lines(
    db: Session,
    date_from: date,
    date_to: date,
) -> RefreshRun:
    company_no = settings.hansa_company_no
    master_company_no = settings.hansa_master_company_no

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
        # Range reload fact table.
        db.execute(
            delete(FactSalesLine).where(
                and_(
                    FactSalesLine.company_no == company_no,
                    FactSalesLine.transaction_date >= date_from,
                    FactSalesLine.transaction_date <= date_to,
                )
            )
        )

        insert_sql = text(
            """
            INSERT INTO fact_sales_lines (
                company_no,
                transaction_date,
                source_type,
                source_no,
                source_row_no,
                source_row_hash,
                order_no,
                customer_code,
                customer_name,
                item_code,
                item_name,
                item_group_code,
                item_group_name,
                location,
                salesperson,
                quantity,
                item_weight,
                unit_coefficient,
                tonnes,
                pay_deal,
                credit_mark,
                invoice_type,
                created_at
            )

            SELECT
                ih.company_no,
                ih.inv_date AS transaction_date,
                'invoice' AS source_type,
                ih.ser_nr AS source_no,
                il.row_number AS source_row_no,
                il.source_row_hash,
                NULL AS order_no,
                ih.cust_code AS customer_code,
                c.name AS customer_name,
                il.art_code AS item_code,
                i.name AS item_name,
                i.item_group_code,
                ig.comment AS item_group_name,
                COALESCE(NULLIF(il.location, ''), ih.location) AS location,
                ih.sales_man AS salesperson,
                il.quant AS quantity,
                i.weight AS item_weight,
                i.unit_coefficient,
                CASE
                    WHEN ih.pay_deal = 'CN'
                    THEN -1 * il.quant * COALESCE(i.unit_coefficient, 0) / 1000
                    ELSE il.quant * COALESCE(i.unit_coefficient, 0) / 1000
                END AS tonnes,
                ih.pay_deal,
                ih.cred_mark AS credit_mark,
                ih.inv_type AS invoice_type,
                now() AS created_at
            FROM hansa_invoice_headers ih
            JOIN hansa_invoice_lines il
              ON il.company_no = ih.company_no
             AND il.ser_nr = ih.ser_nr
            LEFT JOIN customers c
              ON c.company_no = :master_company_no
             AND c.code = ih.cust_code
            LEFT JOIN LATERAL (
                SELECT item.*
                FROM items item
                WHERE item.company_no = :master_company_no
                  AND (
                    item.code = il.art_code
                    OR item.alternative_code = il.art_code
                  )
                ORDER BY
                    CASE
                        WHEN item.code = il.art_code THEN 0
                        ELSE 1
                    END
                LIMIT 1
            ) i ON true
            LEFT JOIN item_groups ig
              ON ig.company_no = :master_company_no
             AND ig.code = i.item_group_code
            WHERE ih.company_no = :company_no
              AND ih.inv_date >= :date_from
              AND ih.inv_date <= :date_to
              AND il.art_code IS NOT NULL
              AND il.art_code <> ''

            UNION ALL

            SELECT
                dh.company_no,
                dh.ship_date AS transaction_date,
                'delivery' AS source_type,
                dh.ser_nr AS source_no,
                dl.row_number AS source_row_no,
                dl.source_row_hash,
                dh.order_nr AS order_no,
                dh.cust_code AS customer_code,
                c.name AS customer_name,
                dl.art_code AS item_code,
                i.name AS item_name,
                i.item_group_code,
                ig.comment AS item_group_name,
                COALESCE(NULLIF(dl.location, ''), dh.location) AS location,
                NULL AS salesperson,
                dl.ship AS quantity,
                i.weight AS item_weight,
                i.unit_coefficient,
                dl.ship * COALESCE(i.unit_coefficient, 0) / 1000 AS tonnes,
                NULL AS pay_deal,
                NULL AS credit_mark,
                NULL AS invoice_type,
                now() AS created_at
            FROM hansa_delivery_headers dh
            JOIN hansa_delivery_lines dl
              ON dl.company_no = dh.company_no
             AND dl.ser_nr = dh.ser_nr
            LEFT JOIN customers c
              ON c.company_no = :master_company_no
             AND c.code = dh.cust_code
            LEFT JOIN LATERAL (
                SELECT item.*
                FROM items item
                WHERE item.company_no = :master_company_no
                  AND (
                    item.code = dl.art_code
                    OR item.alternative_code = dl.art_code
                  )
                ORDER BY
                    CASE
                        WHEN item.code = dl.art_code THEN 0
                        ELSE 1
                    END
                LIMIT 1
            ) i ON true
            LEFT JOIN item_groups ig
              ON ig.company_no = :master_company_no
             AND ig.code = i.item_group_code
            WHERE dh.company_no = :company_no
              AND dh.ship_date >= :date_from
              AND dh.ship_date <= :date_to
              AND dl.art_code IS NOT NULL
              AND dl.art_code <> '';
            """
        )

        db.execute(
            insert_sql,
            {
                "company_no": company_no,
                "master_company_no": master_company_no,
                "date_from": date_from,
                "date_to": date_to,
            },
        )

        records_processed = db.execute(
            select(func.count()).select_from(FactSalesLine).where(
                and_(
                    FactSalesLine.company_no == company_no,
                    FactSalesLine.transaction_date >= date_from,
                    FactSalesLine.transaction_date <= date_to,
                )
            )
        ).scalar_one()

        refresh_run.status = "success"
        refresh_run.finished_at = datetime.now(timezone.utc)
        refresh_run.records_processed = records_processed
        refresh_run.message = "Fact sales lines rebuilt successfully"

        db.commit()
        db.refresh(refresh_run)

        return refresh_run

    except Exception as error:
        db.rollback()

        failed_refresh_run = db.get(RefreshRun, refresh_run.id)

        if failed_refresh_run:
            failed_refresh_run.status = "failed"
            failed_refresh_run.finished_at = datetime.now(timezone.utc)
            failed_refresh_run.message = str(error)
            db.commit()
            db.refresh(failed_refresh_run)
            return failed_refresh_run

        raise