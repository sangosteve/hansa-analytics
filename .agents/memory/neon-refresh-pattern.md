---
name: Neon DB refresh pattern
description: How to run the Hansa data pipeline without Neon connection timeouts
---

## Rule
Each pipeline step (master-data, invoices, deliveries, fact-sales, customer-movement) must use a FRESH DB session. The Hansa API calls take 1-5 minutes; holding a SQLAlchemy session open during that time causes Neon to kill the idle connection, resulting in "server conn crashed?" on rollback.

**Why:** Neon serverless drops idle connections. The original service design holds a session open while awaiting the Hansa HTTP response.

**How to apply:** Use `backend/run_refresh.py` which creates a new `SessionLocal()` per step. Run each step as a separate Python invocation if the tool bash timeout is a concern (steps take 2-5 min each):
1. `python -c "... rebuild_fact_sales_lines ..."` (sync, ~30s)
2. `python -c "... refresh_invoice_source ..."` (async, ~2-4 min)
3. `python -c "... refresh_delivery_source ..."` (async, ~1 min)
4. `python -c "... rebuild_fact_sales_lines ..."` (sync, ~30s)
5. `python -c "... rebuild_customer_product_group_movement ..."` (sync, ~10s)

The database.py engine has `pool_recycle=300`, `pool_pre_ping=True`, and keepalive connect_args set.
