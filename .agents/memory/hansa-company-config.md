---
name: Hansa company config
description: HANSA_COMPANY_NO vs HANSA_MASTER_COMPANY_NO — must be set correctly or all fact_sales tonnes are zero
---

## Rule
- `HANSA_COMPANY_NO=3` — used for ALL Hansa API calls (invoices, deliveries, master data endpoint path) and stored as the company_no on transaction tables (hansa_invoice_headers, fact_sales_lines, etc.)
- `HANSA_MASTER_COMPANY_NO=1` (default) — used in the fact_sales JOIN to look up items/customers. Master data (items, customers, item_groups) is stored with company_no=1 (fetched from Hansa company 1).

**Why:** Hansa company 3 holds transaction data; company 1 holds the shared master catalogue. The fact_sales_service SQL joins invoice lines → items using `item.company_no = :master_company_no`. If master_company_no doesn't match the company_no on stored items, the LEFT JOIN returns no rows → unit_coefficient = NULL → COALESCE = 0 → all tonnes = 0.

**How to apply:** Before running fact-sales or customer-movement, confirm:
1. items/customers have company_no='1'
2. HANSA_MASTER_COMPANY_NO is unset (defaults to '1') or explicitly '1'
3. hansa_invoice_headers have company_no='3'
