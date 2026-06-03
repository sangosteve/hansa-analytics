---
name: Multi-company + sale scope filter
description: Architecture for companyNos array and saleScope filters across frontend and backend.
---

# Multi-company + Sale Scope Filter

## Rule
Frontend passes `company_nos` as repeated query params (`?company_nos=3&company_nos=5`) or `?company_nos=all`. Backend routes accept `company_nos: list[str] = Query(default=None)` and pass through shared helpers in `backend/app/core/filters.py`.

## Internal customer codes
`INTERNAL_CUSTOMER_CODES` frozenset in `filters.py` identifies PSS-ENGINEERING, PSS-MINING, PSS-RETAIL, PSS-MANUFACTURING, PSS-HEADOFFICE, PSS-PROPERTY, PSS-CONSTRUCTION.

## Companies
- 3 = Retail, 4 = Manufacturing, 5 = Engineering, 6 = Mining

## Context shape
`company-context.tsx` exports `{ companyNos: string[], saleScope: "all"|"external"|"internal", companyLabel, setCompanyNos, setSaleScope }`.

**Why:** Sequential HMR edits caused transient "companyNo is not defined" runtime errors mid-cascade. Safe approach: batch all independent edits, then restart the workflow to clear stale HMR state.

**How to apply:** When refactoring a prop rename across many components in a single file (e.g. `companyNo` → `companyNos`), make all edits in one response batch; avoid incremental saves that trigger partial HMR updates.
