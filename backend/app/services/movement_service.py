from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import RefreshRun


def rebuild_customer_product_group_movement(db: Session) -> RefreshRun:
    company_no = settings.hansa_company_no

    refresh_run = RefreshRun(
        company_no=company_no,
        refresh_type="customer_product_group_movement",
        status="running",
    )

    db.add(refresh_run)
    db.commit()
    db.refresh(refresh_run)

    try:
        db.execute(
            text(
                """
                DELETE FROM customer_product_group_movement
                WHERE company_no = :company_no;
                """
            ),
            {"company_no": company_no},
        )

        insert_sql = text(
            """
    WITH as_of AS (
    SELECT
        COALESCE(MAX(transaction_date), CURRENT_DATE)::date AS today
    FROM sales_transactions
    WHERE company_no = :company_no
),

params AS (
    SELECT
        today,
        date_trunc('month', today)::date AS current_month_start,
        (date_trunc('month', today) - interval '6 months')::date AS last_6m_start,
        (date_trunc('month', today) - interval '3 months')::date AS recent_3m_start,
        (date_trunc('month', today) - interval '1 day')::date AS completed_months_end,
        EXTRACT(day FROM today)::numeric AS days_elapsed,
        EXTRACT(
            day FROM (
                date_trunc('month', today)
                + interval '1 month'
                - interval '1 day'
            )
        )::numeric AS days_in_month
    FROM as_of
),

            base AS (
                SELECT
                    st.id,
                    st.company_no,
                    st.customer_code,
                    st.customer_name,
                    COALESCE(st.item_group_code, 'UNKNOWN') AS product_group_code,
                    COALESCE(st.item_group_name, 'Unknown') AS product_group_name,
                    st.transaction_date,
                    COALESCE(st.tonnes, 0) AS tonnes,
                    st.salesperson,
                    st.location
                FROM sales_transactions st
                WHERE st.company_no = :company_no
            ),

            groups AS (
                SELECT DISTINCT
                    b.company_no,
                    b.customer_code,
                    b.customer_name,
                    b.product_group_code,
                    b.product_group_name
                FROM base b
                CROSS JOIN params p
                WHERE b.transaction_date >= p.last_6m_start
                  AND b.transaction_date <= p.today
            ),

            history_by_month AS (
                SELECT
                    b.company_no,
                    b.customer_code,
                    b.product_group_code,
                    date_trunc('month', b.transaction_date)::date AS buying_month,
                    SUM(b.tonnes) AS month_tonnes
                FROM base b
                CROSS JOIN params p
                WHERE b.transaction_date >= p.last_6m_start
                  AND b.transaction_date <= p.completed_months_end
                GROUP BY
                    b.company_no,
                    b.customer_code,
                    b.product_group_code,
                    date_trunc('month', b.transaction_date)::date
            ),

            history_summary AS (
                SELECT
                    h.company_no,
                    h.customer_code,
                    h.product_group_code,
                    COUNT(*) FILTER (WHERE h.month_tonnes > 0) AS buying_months_6m,
                    COALESCE(SUM(h.month_tonnes) FILTER (WHERE h.month_tonnes > 0), 0) AS last_6m_tonnes
                FROM history_by_month h
                GROUP BY
                    h.company_no,
                    h.customer_code,
                    h.product_group_code
            ),

            recent_summary AS (
                SELECT
                    h.company_no,
                    h.customer_code,
                    h.product_group_code,
                    COUNT(*) FILTER (WHERE h.month_tonnes > 0) AS recent_buying_months_3m
                FROM history_by_month h
                CROSS JOIN params p
                WHERE h.buying_month >= p.recent_3m_start
                GROUP BY
                    h.company_no,
                    h.customer_code,
                    h.product_group_code
            ),

            current_summary AS (
                SELECT
                    b.company_no,
                    b.customer_code,
                    b.product_group_code,
                    COALESCE(SUM(b.tonnes), 0) AS current_month_tonnes
                FROM base b
                CROSS JOIN params p
                WHERE b.transaction_date >= p.current_month_start
                  AND b.transaction_date <= p.today
                GROUP BY
                    b.company_no,
                    b.customer_code,
                    b.product_group_code
            ),

            last_purchase AS (
                SELECT
                    b.company_no,
                    b.customer_code,
                    b.product_group_code,
                    MAX(b.transaction_date) AS last_purchase_date
                FROM base b
                WHERE b.tonnes <> 0
                GROUP BY
                    b.company_no,
                    b.customer_code,
                    b.product_group_code
            ),

            latest_meta AS (
                SELECT DISTINCT ON (
                    b.company_no,
                    b.customer_code,
                    b.product_group_code
                )
                    b.company_no,
                    b.customer_code,
                    b.product_group_code,
                    b.location AS last_location
                FROM base b
                ORDER BY
                    b.company_no,
                    b.customer_code,
                    b.product_group_code,
                    b.transaction_date DESC,
                    b.id DESC
            ),

            latest_salesperson AS (
                SELECT DISTINCT ON (
                    b.company_no,
                    b.customer_code,
                    b.product_group_code
                )
                    b.company_no,
                    b.customer_code,
                    b.product_group_code,
                    b.salesperson AS last_salesperson
                FROM base b
                WHERE b.salesperson IS NOT NULL
                  AND b.salesperson <> ''
                ORDER BY
                    b.company_no,
                    b.customer_code,
                    b.product_group_code,
                    b.transaction_date DESC,
                    b.id DESC
            ),

            calc AS (
                SELECT
                    g.company_no,
                    g.customer_code,
                    g.customer_name,
                    g.product_group_code,
                    g.product_group_name,

                    COALESCE(h.buying_months_6m, 0) AS buying_months_6m,
                    COALESCE(r.recent_buying_months_3m, 0) AS recent_buying_months_3m,

                    CASE
                        WHEN COALESCE(h.buying_months_6m, 0) > 0
                        THEN COALESCE(h.last_6m_tonnes, 0) / h.buying_months_6m
                        ELSE 0
                    END AS avg_monthly_tonnes_6m,

                    COALESCE(c.current_month_tonnes, 0) AS current_month_tonnes,

                    CASE
                        WHEN COALESCE(h.buying_months_6m, 0) > 0
                        THEN
                            (COALESCE(h.last_6m_tonnes, 0) / h.buying_months_6m)
                            * (p.days_elapsed / NULLIF(p.days_in_month, 0))
                        ELSE NULL
                    END AS expected_mtd_tonnes,

                    lp.last_purchase_date,

                    CASE
                        WHEN lp.last_purchase_date IS NOT NULL
                        THEN p.today - lp.last_purchase_date
                        ELSE NULL
                    END AS days_since_last_purchase,

                    ls.last_salesperson,
                    lm.last_location

                FROM groups g
                CROSS JOIN params p
                LEFT JOIN history_summary h
                    ON h.company_no = g.company_no
                   AND h.customer_code = g.customer_code
                   AND h.product_group_code = g.product_group_code
                LEFT JOIN recent_summary r
                    ON r.company_no = g.company_no
                   AND r.customer_code = g.customer_code
                   AND r.product_group_code = g.product_group_code
                LEFT JOIN current_summary c
                    ON c.company_no = g.company_no
                   AND c.customer_code = g.customer_code
                   AND c.product_group_code = g.product_group_code
                LEFT JOIN last_purchase lp
                    ON lp.company_no = g.company_no
                   AND lp.customer_code = g.customer_code
                   AND lp.product_group_code = g.product_group_code
                LEFT JOIN latest_meta lm
                    ON lm.company_no = g.company_no
                   AND lm.customer_code = g.customer_code
                   AND lm.product_group_code = g.product_group_code
                LEFT JOIN latest_salesperson ls
                    ON ls.company_no = g.company_no
                   AND ls.customer_code = g.customer_code
                   AND ls.product_group_code = g.product_group_code
            ),

            gap_calc AS (
                SELECT
                    c.*,
                    CASE
                        WHEN c.expected_mtd_tonnes IS NOT NULL
                        THEN c.current_month_tonnes - c.expected_mtd_tonnes
                        ELSE NULL
                    END AS tonnage_gap,

                    CASE
                        WHEN c.expected_mtd_tonnes IS NOT NULL
                         AND c.expected_mtd_tonnes <> 0
                        THEN (c.current_month_tonnes - c.expected_mtd_tonnes) / c.expected_mtd_tonnes
                        ELSE NULL
                    END AS gap_percent
                FROM calc c
            ),

            status_calc AS (
                SELECT
                    g.*,

                    CASE
                        WHEN g.buying_months_6m >= 2
                         AND g.recent_buying_months_3m >= 1
                         AND g.current_month_tonnes = 0
                         AND g.days_since_last_purchase >= 90
                        THEN 'Lapsed'

                        WHEN g.buying_months_6m >= 2
                         AND g.recent_buying_months_3m >= 1
                         AND g.current_month_tonnes = 0
                         AND g.days_since_last_purchase >= 60
                        THEN 'Stopped'

                        WHEN g.buying_months_6m >= 2
                         AND g.recent_buying_months_3m >= 1
                         AND g.current_month_tonnes = 0
                        THEN 'No Purchase'

                        WHEN g.buying_months_6m >= 2
                         AND g.recent_buying_months_3m >= 1
                         AND g.current_month_tonnes > 0
                         AND g.gap_percent <= -0.30
                         AND g.tonnage_gap <= -0.50
                        THEN 'Below Expected'

                        WHEN g.buying_months_6m >= 2
                         AND g.recent_buying_months_3m >= 1
                         AND g.current_month_tonnes > 0
                         AND g.gap_percent >= 0.30
                        THEN 'Growing'

                        WHEN g.buying_months_6m >= 2
                         AND g.recent_buying_months_3m >= 1
                         AND g.current_month_tonnes > 0
                        THEN 'Active'

                        WHEN g.buying_months_6m = 1
                         AND g.current_month_tonnes = 0
                        THEN 'One-off'

                        WHEN g.buying_months_6m = 1
                         AND g.current_month_tonnes > 0
                        THEN 'Occasional'

                        WHEN g.buying_months_6m = 0
                         AND g.current_month_tonnes > 0
                        THEN 'New'

                        ELSE NULL
                    END AS buyer_status

                FROM gap_calc g
            ),

            final_rows AS (
                SELECT
                    s.*,
                    CASE
                        WHEN s.buyer_status IN ('Lapsed', 'Stopped', 'Below Expected')
                        THEN 'Action Required'

                        WHEN s.buyer_status IN ('No Purchase', 'One-off', 'Occasional')
                        THEN 'Monitor'

                        WHEN s.buyer_status IN ('Active', 'Growing', 'New')
                        THEN 'Healthy'

                        ELSE NULL
                    END AS action_band
                FROM status_calc s
            )

            INSERT INTO customer_product_group_movement (
                company_no,
                customer_code,
                customer_name,
                product_group_code,
                product_group_name,
                buying_months_6m,
                recent_buying_months_3m,
                avg_monthly_tonnes_6m,
                current_month_tonnes,
                expected_mtd_tonnes,
                tonnage_gap,
                gap_percent,
                last_purchase_date,
                days_since_last_purchase,
                last_salesperson,
                last_location,
                buyer_status,
                action_band,
                created_at
            )
            SELECT
                company_no,
                customer_code,
                customer_name,
                product_group_code,
                product_group_name,
                buying_months_6m,
                recent_buying_months_3m,
                avg_monthly_tonnes_6m,
                current_month_tonnes,
                expected_mtd_tonnes,
                tonnage_gap,
                gap_percent,
                last_purchase_date,
                days_since_last_purchase,
                last_salesperson,
                last_location,
                buyer_status,
                action_band,
                now()
            FROM final_rows
            WHERE buyer_status IS NOT NULL;
            """
        )

        result = db.execute(insert_sql, {"company_no": company_no})

        refresh_run.status = "success"
        refresh_run.finished_at = datetime.now(timezone.utc)
        refresh_run.records_processed = result.rowcount if result.rowcount is not None else 0
        refresh_run.message = "Customer product group movement rebuilt successfully"

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