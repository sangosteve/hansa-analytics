---
name: Multi-company + sale scope filter
description: Architecture for companyNos array and saleScope filters across frontend and backend.
---

# Multi-company + Sale Scope Filter

## Rule
Frontend passes `company_nos` as repeated query params (`?company_nos=3&company_nos=5`) or `?company_nos=all`. Backend routes accept `company_nos: list[str] = Query(default=None)` and pass through shared helpers in `backend/app/core/filters.py`.

## Internal customer codes (actual DB values)
`INTERNAL_CUSTOMER_CODES` in `filters.py`: PSS002, PSS002U, PSS003U (Engineering), PSS004U (Manufacturing), PSS005U (Mining), PSS006U (Property), PSS007U (Transport), PSS008U (Construction), PSS0008U. Named codes like "PSS-ENGINEERING" do NOT exist in fact_sales_lines — always use the numeric codes above.

## SQL correlated subquery gotcha
Never use `co_frag.replace('company_no', 'f2.company_no')` — it corrupts SQLAlchemy bind params (`:company_no` → `:f2.company_no`). For self-correlated subqueries, use `f2.company_no = fact_sales_lines.company_no` directly.

## Companies
- 3 = Retail, 4 = Manufacturing, 5 = Engineering, 6 = Mining

## Context shape
`company-context.tsx` exports `{ companyNos, setCompanyNos, saleScope, setSaleScope, companyLabel, datePreset, setDatePreset, dateFrom, dateTo }`. Date state is computed from preset (no manual input); presets: 1m/3m/6m/ytd/1y/2y/all.

**Why:** Sequential HMR edits caused transient "companyNo is not defined" runtime errors mid-cascade. Safe approach: batch all independent edits, then restart the workflow to clear stale HMR state.

**How to apply:** When refactoring a prop rename across many components in a single file (e.g. `companyNo` → `companyNos`), make all edits in one response batch; avoid incremental saves that trigger partial HMR updates.
