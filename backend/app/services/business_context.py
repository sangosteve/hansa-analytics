"""
Business context, glossary, and semantic layer for Hansa Analytics AI.
Single source of truth for all AI prompts and company/scope mapping.
"""

from typing import Optional

# ─── Company mapping ───────────────────────────────────────────────────────────

COMPANY_MAP: dict[str, str] = {
    "3": "Retail",
    "4": "Manufacturing",
    "5": "Engineering",
    "6": "Mining",
}

ACTIVE_COMPANIES: list[str] = ["3", "4", "5", "6"]

# Maps common user words → company_nos
DIVISION_ALIASES: dict[str, list[str]] = {
    "retail":        ["3"],
    "manufacturing": ["4"],
    "engineering":   ["5"],
    "mining":        ["6"],
    "wire":          ["4"],
    "frames":        ["4"],
    "steel":         ["3", "5"],
    "structural":    ["3", "5"],
    "reinforcing":   ["3", "6"],
    "cement":        ["3"],
    "co3":           ["3"],
    "co4":           ["4"],
    "co5":           ["5"],
    "co6":           ["6"],
    "company3":      ["3"],
    "company4":      ["4"],
    "company5":      ["5"],
    "company6":      ["6"],
    "division3":     ["3"],
    "division4":     ["4"],
    "division5":     ["5"],
    "division6":     ["6"],
    "all":           ["3", "4", "5", "6"],
    "group":         ["3", "4", "5", "6"],
    "overall":       ["3", "4", "5", "6"],
}

# Internal (inter-company) customers — codes used in the ERP
INTERNAL_CUSTOMER_CODES: frozenset[str] = frozenset({
    "PSS002", "PSS002U", "PSS003U", "PSS004U",
    "PSS005U", "PSS006U", "PSS007U", "PSS008U", "PSS0008U",
})

# Internal customer business names (for context/display)
INTERNAL_CUSTOMER_NAMES: list[str] = [
    "PSS-RETAIL", "PSS-MANUFACTURING", "PSS-ENGINEERING",
    "PSS-MINING", "PSS-HEADOFFICE", "PSS-PROPERTY", "PSS-CONSTRUCTION",
]


# ─── Intent types ──────────────────────────────────────────────────────────────

INTENT_TYPES = [
    "trend_analysis",
    "ranking_analysis",
    "comparison_analysis",
    "drilldown_analysis",
    "customer_movement_analysis",
    "internal_external_sales_analysis",
    "salesperson_performance_analysis",
    "predictive_analysis",
    "anomaly_detection",
    "explanation_analysis",
    "clarification_needed",
]


# ─── Scope label helpers ───────────────────────────────────────────────────────

def company_label(company_nos: "list[str] | None") -> str:
    """Human-readable label for the company filter used."""
    if not company_nos or set(company_nos) >= {"3", "4", "5", "6"} or "all" in company_nos:
        return "All Companies (Retail, Manufacturing, Engineering, Mining)"
    if len(company_nos) == 1:
        return f"Company {company_nos[0]} ({COMPANY_MAP.get(company_nos[0], company_nos[0])})"
    names = [COMPANY_MAP.get(c, c) for c in company_nos]
    return f"Companies {', '.join(company_nos)} ({', '.join(names)})"


def scope_label(sale_scope: "str | None") -> str:
    if not sale_scope or sale_scope == "all":
        return "All sales (internal + external)"
    if sale_scope == "external":
        return "External sales only"
    if sale_scope == "internal":
        return "Internal/inter-company sales only"
    return sale_scope


def company_scope_sentence(company_nos: "list[str] | None", sale_scope: "str | None") -> str:
    """One-sentence scope description for AI responses."""
    c = company_label(company_nos)
    s = scope_label(sale_scope)
    return f"Using {c} — {s}."


# ─── Business glossary injected into every AI prompt ──────────────────────────

BUSINESS_GLOSSARY = """
=== HANSA ANALYTICS — BUSINESS GLOSSARY ===

COMPANY / DIVISION MAPPING:
  Company 3 = Retail       (steel trading, structural, reinforcing, cement, plates)
  Company 4 = Manufacturing (wire products, door frames, window frames, welded mesh)
  Company 5 = Engineering   (structural steel, engineering supplies, separate branch)
  Company 6 = Mining        (reinforcing bar, mining consumables)
  Company 1 = Shared master data (items, item groups, customers) — NOT an operating division.
  Active operating companies: 3, 4, 5, 6

  Division aliases: "retail"→3, "manufacturing"→4, "engineering"→5, "mining"→6,
    "wire/frames"→4, "structural/steel"→3+5, "all/group/company-wide"→3+4+5+6

SALES VOLUME:
  All volume = TONNES. Never refer to "units" or "quantity" — the business metric is tonnes.

SALES DATA SOURCES (do not double-count):
  - Invoice-based sales: use invoice lines for tonnage + invoice salesperson field.
  - Delivery-based sales: use delivery lines for tonnage + salesperson from linked sales order.
  - fact_sales_lines is the trusted analytics fact table — already de-duplicated.
  - Rows with missing ArtCode (item_code) are excluded from analytics.
  - If salesperson cannot be resolved, the row is labelled "Unassigned".

INTERNAL vs EXTERNAL SALES:
  Internal (inter-company) customers: PSS-RETAIL, PSS-MANUFACTURING, PSS-ENGINEERING,
    PSS-MINING, PSS-HEADOFFICE, PSS-PROPERTY, PSS-CONSTRUCTION.
  External = all other customers.
  Filters: sale_scope = "all" | "external" | "internal"

CUSTOMER MOVEMENT:
  - "Active": buying regularly in the current period.
  - "Declining": volume in recent months below their own historical average.
  - "At-risk": still buying but trend is downward.
  - "Stopped": no purchase in recent period but bought before.
  - "Churned": inactive for 60+ days despite prior regular buying.
  - Lapse risk: bought in 3+ of last 6 months but absent this month.

PREDICTIVE INSIGHTS (always use cautious language):
  - MTD Projection: current-month-to-date ÷ elapsed days × days-in-month.
  - Growth/decline: compare recent 3 months vs prior 3 months.
  - "Likely", "projected", "at risk", "trending", "based on current run rate".
  - Never present projections as certainties.

DATE / REPORTING PERIOD:
  - The database contains data from July 2024 through February 2026.
  - MAX(transaction_date) = 2026-02-09 — use this as the reference "today" for all relative dates.
  - "This month" = February 2026, "Last month" = January 2026.
  - "YTD" = January 2026 → February 2026.
  - "Last 6 months" = August 2025 → February 2026.
  - "Last year" = 2025 full year.

COMPANY SELECTION RULES:
  1. User mentions one division → filter to that company only.
  2. User mentions multiple divisions → filter to those companies.
  3. User says "all", "group", "company-wide", "overall" → all 4 companies.
  4. User mentions no division → use dashboard context company filter.
  5. No dashboard context → default to all 4 companies.

RESPONSE SCOPE DISCLOSURE:
  Always state which company scope was used: "Using Retail only…" / "Using all companies…"
=== END GLOSSARY ===
"""


# ─── Semantic metrics + dimensions available to the AI ────────────────────────

ALLOWED_METRICS = [
    "total_tonnes", "invoice_tonnes", "delivery_tonnes",
    "customer_count", "item_count",
    "average_monthly_tonnes", "current_month_tonnes", "previous_month_tonnes",
    "growth_percent", "gap_percent",
]

ALLOWED_DIMENSIONS = [
    "company", "sector", "customer", "item_group", "item",
    "salesperson", "sale_scope", "source_type", "month", "week", "day",
]

ALLOWED_FILTERS = [
    "company_nos", "date_from", "date_to", "sale_scope",
    "customer_code", "item_group_code", "item_code", "salesperson", "location",
]
