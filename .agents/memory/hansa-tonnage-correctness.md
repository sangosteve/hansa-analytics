---
name: Hansa tonnage correctness rules
description: Which invoice/delivery lines to include in fact_sales_lines to avoid double-counting and miscount
---

# Hansa Tonnage Correctness

## Key rules implemented in fact_sales_service.py

### 1. Invoice line filter (not_upd_stock_flag)
- Invoice headers all have `upd_stock_flag=1` (API fetches with `filter.UpdStockFlag=1`) — no double-counting at header level
- But individual invoice LINES can have `not_upd_stock_flag=1` — these lines do NOT update stock and must be excluded
- SQL fix: `AND (il.not_upd_stock_flag IS NULL OR il.not_upd_stock_flag = 0)`
- Impact: removed 13,791 lines, reduced invoice tonnage from ~12,989t → ~8,679t (for July 2024–Feb 2026)

### 2. No double-counting from deliveries
- Invoices with `upd_stock_flag=0` (Flow 2: SO→Invoice→Delivery) are already excluded by API filter
- Deliveries always update stock → include all of them
- UNION ALL of invoice side + delivery side is correct (no double-count when API filter is applied)

### 3. Delivery salesperson attribution
- Delivery headers have `order_nr` (100% populated)
- Invoice headers now have `order_no` column (migration a1b2c3d4e5f6, June 2026)
- SQL join: delivery→invoice via `ih2.order_no = dh.order_nr` to get `sales_man`
- Falls back to 'Unassigned' if no match (typical for existing data before order_no was fetched)
- To fix: run invoice refresh (`POST /api/refresh/source/invoices`) then fact rebuild

**Why:** Without the not_upd_stock_flag filter, cancelled/service lines count as sold tonnage. Without delivery salesperson attribution, ~3,890t shows as "Unassigned" instead of being credited to the originating rep.
