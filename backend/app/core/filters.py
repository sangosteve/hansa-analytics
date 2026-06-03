"""
Shared SQL filter builders used across all route modules.
"""

ACTIVE_COMPANIES: tuple[str, ...] = ("3", "4", "5", "6")

INTERNAL_CUSTOMER_CODES: frozenset[str] = frozenset({
    "PSS-ENGINEERING",
    "PSS-MINING",
    "PSS-RETAIL",
    "PSS-MANUFACTURING",
    "PSS-HEADOFFICE",
    "PSS-PROPERTY",
    "PSS-CONSTRUCTION",
})

_INTERNAL_CODES_SQL = ", ".join(f"'{c}'" for c in sorted(INTERNAL_CUSTOMER_CODES))


def build_company_filter(
    company_nos: "list[str] | str | None",
    col: str = "company_no",
) -> "tuple[str, dict]":
    """
    Build (SQL fragment, params dict) for a company filter.

    Accepts:
        None or "all" or ["all"]  → all active companies
        "3"                        → single company
        ["3", "5"]                 → multiple companies

    Values are validated against ACTIVE_COMPANIES whitelist — safe to embed as literals.
    """
    if not company_nos:
        return f"{col} IN ('3','4','5','6')", {}

    if isinstance(company_nos, str):
        company_nos = [company_nos]

    if "all" in company_nos:
        return f"{col} IN ('3','4','5','6')", {}

    valid = [c for c in company_nos if c in ACTIVE_COMPANIES]
    if not valid:
        return f"{col} IN ('3','4','5','6')", {}

    if len(valid) == 1:
        return f"{col} = :company_no", {"company_no": valid[0]}

    placeholders = ", ".join(f"'{c}'" for c in valid)
    return f"{col} IN ({placeholders})", {}


def build_scope_sql(sale_scope: "str | None", col: str = "customer_code") -> str:
    """
    Return a SQL AND-fragment for the sale_scope filter.
    Returns "" when scope is "all" or None.

    sale_scope values:
        "all"      → no filter (all sales)
        "external" → exclude internal customer codes
        "internal" → include only internal customer codes
    """
    if not sale_scope or sale_scope == "all":
        return ""
    if sale_scope == "internal":
        return f"AND {col} IN ({_INTERNAL_CODES_SQL})"
    if sale_scope == "external":
        return f"AND {col} NOT IN ({_INTERNAL_CODES_SQL})"
    return ""
