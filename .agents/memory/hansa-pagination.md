---
name: Hansa client pagination
description: Hansa REST API pagination params and OOM fix for large master data fetches.
---

# Hansa Client Pagination

## Rule
Hansa REST API paginates with `?limit=N&offset=N`. Other common params (`start`, `skip`, `page`, `from`) do NOT work — offset is the only working offset param.

## Scale (live server)
- Items (INVc): ~14,789 records
- Customers (CUVc): ~3,439 records
- Item groups (ITVc): 123 records (small, safe to fetch all at once)

## OOM Fix
Loading all items/customers in one shot via `get_items()` / `get_customers()` OOM-kills the Python process (exit -1, no output). Solution: use `client.iter_pages(path)` async generator which yields 500 records at a time, bulk-upsert each page, commit per page.

## Master data script
`backend/run_master_data.py` — standalone script that streams + bulk-upserts all master data. Run separately from transactions.

## Transaction refresh
`backend/run_refresh.py --skip-master` — runs all 4 companies. DATE_FROM = 2025-01-01, DATE_TO = today. Takes ~5 min.

**Why:** The original `python -c "..."` with long inline code was silently killed by the sandbox; proper .py script files work correctly.

**How to apply:** For any new large Hansa endpoint, always use `iter_pages()` not `get_*()` bulk fetch. Never inline long scripts via `python -c`.
