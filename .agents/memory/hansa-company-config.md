---
name: Hansa company config
description: Which company numbers to use for transactions vs master data, and how they're parameterized
---

# Hansa Company Configuration

## Rule
- `master_company_no` (env: HANSA_MASTER_COMPANY_NO, default "1") — used for items, customers, item_groups lookups
- `company_no` (env: HANSA_COMPANY_NO) — used for transaction data (invoices, deliveries). Currently company "3" (Retail)
- Setting master_company_no wrong causes all tonnes = 0 (no item/unit_coefficient lookups resolve)

## Multi-company support (added June 2026)
- All service functions (`refresh_invoice_source`, `refresh_delivery_source`, `rebuild_fact_sales_lines`) now accept `company_no` as optional parameter
- Refresh routes accept `company_no` in request body (defaults to HANSA_COMPANY_NO env var)
- `HansaClient(company_no=...)` accepts per-call override
- Companies 3,4,5,6 in the frontend dropdown; 3 is the only one with data currently

## Why
Hansa ERP uses separate company numbers for different business divisions. The API path includes company_no: `api/{company_no}/IVVc`. Without parameterization you can't fetch multi-company data.

## How to apply
Pass `company_no` explicitly when calling any service function or the refresh API. Never hardcode `settings.hansa_company_no` in service logic.
