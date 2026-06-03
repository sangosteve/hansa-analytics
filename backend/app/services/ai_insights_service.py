"""
AI Insights Service — multi-step orchestration with intent classification.

Flow:
  1. classify_intent()   — identify what the user wants
  2. plan_steps()        — choose 1–3 tool calls
  3. execute_steps()     — run each tool safely
  4. synthesize()        — generate answer + chart + table from all results

Business context is injected from business_context.py.
All DB access goes through analytics_tools.py — no raw SQL here.
"""

import json
import logging
from datetime import date
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.schemas.ai import AIInsightRequest, AIInsightResponse, AIChartConfig, AITableResult
from app.services import analytics_tools
from app.services.business_context import (
    BUSINESS_GLOSSARY,
    COMPANY_MAP,
    ACTIVE_COMPANIES,
    company_label,
    scope_label,
    company_scope_sentence,
)

logger = logging.getLogger(__name__)

# ─── Tool catalogue ────────────────────────────────────────────────────────────

TOOL_CATALOGUE: list[dict] = [
    {
        "name": "get_sales_trend",
        "intent_tags": ["trend_analysis", "drilldown_analysis"],
        "description": (
            "Monthly sales trend over time. Use for: overall trends, 'how are sales trending', "
            "'YTD performance', 'sales over the last N months', 'which months were best/worst'. "
            "Set dimension to: total | item_group | customer | salesperson | location."
        ),
        "parameters": {
            "company_nos": "list[str] — e.g. ['3'] or ['3','4','5','6']. REQUIRED.",
            "dimension": "total | item_group | customer | salesperson | location",
            "date_from": "YYYY-MM-DD",
            "date_to": "YYYY-MM-DD",
            "location": "optional string",
            "salesperson": "optional string",
            "item_group_code": "optional string",
        },
    },
    {
        "name": "get_sales_by_company",
        "intent_tags": ["ranking_analysis", "comparison_analysis"],
        "description": (
            "Compare sales across all divisions. Use for: 'compare divisions/companies', "
            "'which company sold most', 'division breakdown', 'rank companies by tonnage', "
            "'group-wide sales', 'company performance'."
        ),
        "parameters": {
            "company_nos": "list[str] — use ['3','4','5','6'] to compare all divisions.",
            "date_from": "YYYY-MM-DD",
            "date_to": "YYYY-MM-DD",
            "item_group_code": "optional string",
        },
    },
    {
        "name": "get_sales_by_item_group",
        "intent_tags": ["ranking_analysis", "drilldown_analysis"],
        "description": (
            "Sales ranked by product group. Use for: 'top product groups', 'product mix', "
            "'which products sell most', 'what are we selling', 'product contribution'."
        ),
        "parameters": {
            "company_nos": "list[str]. REQUIRED.",
            "date_from": "YYYY-MM-DD",
            "date_to": "YYYY-MM-DD",
            "location": "optional",
            "salesperson": "optional",
        },
    },
    {
        "name": "get_sales_by_customer",
        "intent_tags": ["ranking_analysis", "drilldown_analysis"],
        "description": (
            "Sales ranked by customer. Use for: 'top customers', 'biggest buyers', "
            "'customer ranking', 'who buys the most', 'customer concentration'."
        ),
        "parameters": {
            "company_nos": "list[str]. REQUIRED.",
            "date_from": "YYYY-MM-DD",
            "date_to": "YYYY-MM-DD",
            "location": "optional",
            "item_group_code": "optional",
            "salesperson": "optional",
        },
    },
    {
        "name": "get_sales_by_salesperson",
        "intent_tags": ["salesperson_performance_analysis", "ranking_analysis"],
        "description": (
            "Sales performance by salesperson. Use for: 'salesperson performance', "
            "'who is selling most', 'sales rep ranking', 'rep performance', 'sales team'."
        ),
        "parameters": {
            "company_nos": "list[str]. REQUIRED — filter to specific division when asked.",
            "date_from": "YYYY-MM-DD",
            "date_to": "YYYY-MM-DD",
            "location": "optional",
            "item_group_code": "optional",
        },
    },
    {
        "name": "get_sales_by_location",
        "intent_tags": ["ranking_analysis", "comparison_analysis"],
        "description": "Sales by branch/location. Use for: 'branch performance', 'regional breakdown'.",
        "parameters": {
            "company_nos": "list[str]. REQUIRED.",
            "date_from": "YYYY-MM-DD",
            "date_to": "YYYY-MM-DD",
            "item_group_code": "optional",
        },
    },
    {
        "name": "get_internal_vs_external_sales",
        "intent_tags": ["internal_external_sales_analysis", "comparison_analysis"],
        "description": (
            "Split sales into internal (inter-company) vs external customers. "
            "Use for: 'compare internal vs external', 'how much is inter-company', "
            "'external customer sales', 'show internal sales', 'exclude internal'."
        ),
        "parameters": {
            "company_nos": "list[str]. REQUIRED.",
            "date_from": "YYYY-MM-DD",
            "date_to": "YYYY-MM-DD",
            "item_group_code": "optional",
        },
    },
    {
        "name": "compare_current_vs_previous_month",
        "intent_tags": ["comparison_analysis", "explanation_analysis"],
        "description": (
            "Month-over-month comparison. Use for: 'how is this month going', "
            "'compare to last month', 'MoM growth', 'are we up or down vs last month', "
            "'why did sales change'. Can break down by item_group, salesperson, location."
        ),
        "parameters": {
            "company_nos": "list[str]. REQUIRED.",
            "dimension": "total | item_group | salesperson | location",
        },
    },
    {
        "name": "get_declining_product_groups",
        "intent_tags": ["trend_analysis", "explanation_analysis", "anomaly_detection"],
        "description": (
            "Compare product groups: recent 3 months vs prior 3 months. "
            "Use for: 'which products are declining', 'product trends', "
            "'what is losing volume', 'which categories are shrinking/growing'."
        ),
        "parameters": {
            "company_nos": "list[str]. REQUIRED.",
            "location": "optional",
            "salesperson": "optional",
        },
    },
    {
        "name": "get_top_growing_groups",
        "intent_tags": ["trend_analysis", "ranking_analysis"],
        "description": (
            "Product groups with strongest positive growth: recent 3m vs prior 3m. "
            "Use for: 'growing product groups', 'what is growing', 'top performers', 'which products are up'."
        ),
        "parameters": {
            "company_nos": "list[str]. REQUIRED.",
            "location": "optional",
        },
    },
    {
        "name": "get_churned_customers",
        "intent_tags": ["customer_movement_analysis"],
        "description": (
            "Customers who stopped buying — sorted by lost monthly volume. "
            "Use for: 'which customers stopped buying', 'lost customers', 'churned customers', "
            "'inactive customers', 'customers we haven't seen', 'who stopped'. "
            "days_inactive: 30=recently stopped, 60=default, 90=long gone."
        ),
        "parameters": {
            "company_nos": "list[str]. REQUIRED.",
            "days_inactive": "int (default 60)",
            "product_group_code": "optional",
            "location": "optional",
            "salesperson": "optional",
        },
    },
    {
        "name": "get_customer_movement_insights",
        "intent_tags": ["customer_movement_analysis", "explanation_analysis"],
        "description": (
            "At-risk and declining customers — compares recent 2 months vs prior 2 months. "
            "Use for: 'at-risk customers', 'buying less', 'customer health', "
            "'who needs a visit', 'declining customers', 'customers to watch'."
        ),
        "parameters": {
            "company_nos": "list[str]. REQUIRED.",
            "product_group_code": "optional",
            "location": "optional",
            "salesperson": "optional",
        },
    },
    {
        "name": "get_fast_movers",
        "intent_tags": ["trend_analysis", "ranking_analysis"],
        "description": (
            "Items with highest velocity and growth. "
            "Use for: 'fast moving items', 'high demand products', 'what is selling fast', 'hot items'."
        ),
        "parameters": {
            "company_nos": "list[str]. REQUIRED.",
            "item_group_code": "optional",
            "location": "optional",
        },
    },
    {
        "name": "get_slow_movers",
        "intent_tags": ["anomaly_detection", "ranking_analysis"],
        "description": (
            "Items with little or no recent sales. "
            "Use for: 'slow moving items', 'dead stock', 'what is not selling', 'stagnant inventory'."
        ),
        "parameters": {
            "company_nos": "list[str]. REQUIRED.",
            "item_group_code": "optional",
            "days_slow": "int days of inactivity threshold (default 60)",
        },
    },
    {
        "name": "get_stock_recommendations",
        "intent_tags": ["predictive_analysis"],
        "description": (
            "Stock vs sales velocity — items running low or overstocked. "
            "Use for: 'what should we stock', 'low stock alerts', 'stock recommendations', "
            "'running out of stock', 'reorder suggestions', 'inventory health', 'overstocked'."
        ),
        "parameters": {
            "company_nos": "list[str]. REQUIRED.",
            "location": "optional",
            "item_group_code": "optional",
        },
    },
    {
        "name": "project_month_end_sales",
        "intent_tags": ["predictive_analysis"],
        "description": (
            "Project current month end tonnage based on MTD run rate. "
            "Use for: 'project this month', 'month-end forecast', 'how will we close', "
            "'are we on track', 'MTD projection', 'end of month estimate'."
        ),
        "parameters": {
            "company_nos": "list[str]. REQUIRED.",
            "sale_scope": "all | external | internal",
            "item_group_code": "optional",
            "salesperson": "optional",
        },
    },
    {
        "name": "identify_products_to_push",
        "intent_tags": ["predictive_analysis", "ranking_analysis"],
        "description": (
            "Products sales should focus on: growing demand, low stock, or recovery opportunities. "
            "Use for: 'what should sales focus on', 'products to push', 'where to focus', "
            "'sales opportunities', 'which products need attention', 'strategic focus'."
        ),
        "parameters": {
            "company_nos": "list[str]. REQUIRED.",
            "location": "optional",
        },
    },
]

# ─── Growing alias (must be defined before _TOOL_FN_MAP) ──────────────────────

def _make_growing_alias(*args, **kwargs):
    """get_declining_product_groups returns both growing and declining — filter here."""
    result = analytics_tools.get_declining_product_groups(*args, **kwargs)
    result["rows"] = [r for r in result.get("rows", []) if r.get("change_tonnes", 0) > 0]
    result["rows"].sort(key=lambda x: x.get("change_tonnes", 0), reverse=True)
    return result


# Build name → function map from analytics_tools
_TOOL_FN_MAP: dict[str, Any] = {
    "get_sales_trend":                   analytics_tools.get_sales_trend,
    "get_sales_by_company":              analytics_tools.get_sales_by_company,
    "get_sales_by_item_group":           analytics_tools.get_sales_by_item_group,
    "get_sales_by_customer":             analytics_tools.get_sales_by_customer,
    "get_sales_by_salesperson":          analytics_tools.get_sales_by_salesperson,
    "get_sales_by_location":             analytics_tools.get_sales_by_location,
    "get_internal_vs_external_sales":    analytics_tools.get_internal_vs_external_sales,
    "compare_current_vs_previous_month": analytics_tools.compare_current_vs_previous_month,
    "get_declining_product_groups":      analytics_tools.get_declining_product_groups,
    "get_churned_customers":             analytics_tools.get_churned_customers,
    "get_customer_movement_insights":    analytics_tools.get_customer_movement_insights,
    "get_fast_movers":                   analytics_tools.get_fast_movers,
    "get_slow_movers":                   analytics_tools.get_slow_movers,
    "get_stock_recommendations":         analytics_tools.get_stock_recommendations,
    "project_month_end_sales":           analytics_tools.project_month_end_sales,
    "identify_products_to_push":         analytics_tools.identify_products_to_push,
    "get_top_growing_groups":            _make_growing_alias,
}


# ─── Date coercion ─────────────────────────────────────────────────────────────

def _coerce_dates(params: dict[str, Any]) -> dict[str, Any]:
    out = dict(params)
    for k in ("date_from", "date_to"):
        v = out.get(k)
        if isinstance(v, str) and v:
            try:
                out[k] = date.fromisoformat(v[:10])
            except ValueError:
                out.pop(k, None)
        elif v is not None and not isinstance(v, date):
            out.pop(k, None)
    return out


# ─── OpenAI client factory ─────────────────────────────────────────────────────

def _openai_client():
    from openai import OpenAI
    import httpx
    return OpenAI(api_key=settings.openai_api_key, http_client=httpx.Client(mounts=None))


def _clean_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(ln for ln in lines if not ln.startswith("```")).strip()
    return text


# ─── Step 1: Classify intent ───────────────────────────────────────────────────

INTENT_DESCRIPTIONS = {
    "trend_analysis": "sales over time, growth/decline trajectory",
    "ranking_analysis": "top/bottom lists, comparisons, league tables",
    "comparison_analysis": "comparing two things: periods, companies, scopes",
    "drilldown_analysis": "zooming into a specific customer, product, or rep",
    "customer_movement_analysis": "churned, at-risk, stopped, declining customers",
    "internal_external_sales_analysis": "inter-company vs external customer sales",
    "salesperson_performance_analysis": "rep rankings, performance, attribution",
    "predictive_analysis": "projections, forecasts, month-end estimates, stock cover",
    "anomaly_detection": "unusual drops, outliers, dead stock, fast/slow movers",
    "explanation_analysis": "'why' questions — need multiple tools to answer",
    "clarification_needed": "out of scope or genuinely unclear",
}


def classify_intent(message: str) -> str:
    """Classify the user's question into one intent type."""
    if not settings.openai_api_key:
        return "ranking_analysis"
    try:
        client = _openai_client()
        desc = "\n".join(f"  {k}: {v}" for k, v in INTENT_DESCRIPTIONS.items())
        prompt = (
            f"{BUSINESS_GLOSSARY}\n\n"
            f"Classify this question into ONE intent type:\n\n"
            f"Question: \"{message}\"\n\n"
            f"Intent types:\n{desc}\n\n"
            "Respond with ONLY the intent type key (no quotes, no extra text)."
        )
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=20,
        )
        raw = resp.choices[0].message.content.strip().lower().replace('"', "").replace("'", "")
        return raw if raw in INTENT_DESCRIPTIONS else "ranking_analysis"
    except Exception as e:
        logger.warning(f"Intent classification failed: {e}")
        return "ranking_analysis"


# ─── Step 2: Plan analysis steps ──────────────────────────────────────────────

def plan_steps(
    message: str,
    intent: str,
    request: AIInsightRequest,
) -> list[dict[str, Any]]:
    """
    Ask the AI to plan 1–3 tool steps to answer the question.
    Returns: [{tool_name, parameters, purpose}, ...]
    """
    if not settings.openai_api_key:
        return []

    today_ref = date(2026, 2, 9)  # data max date — always use this as reference
    tools_json = json.dumps(
        [{"name": t["name"], "description": t["description"], "parameters": t["parameters"]}
         for t in TOOL_CATALOGUE],
        indent=2,
    )

    # Build context block
    req_co = request.company_nos or ["3", "4", "5", "6"]
    req_scope = request.sale_scope or "all"

    ui_filter = (
        f"Dashboard context: company_nos={req_co}, sale_scope='{req_scope}'"
        + (f", date_from={request.date_from}, date_to={request.date_to}"
           if request.date_from else "")
    )

    max_steps = 3 if intent == "explanation_analysis" else 1

    prompt = f"""
{BUSINESS_GLOSSARY}

Reference date (data max): {today_ref}
{ui_filter}
User intent classified as: {intent}

Available tools:
{tools_json}

User question: "{message}"

PLANNING RULES:
1. Return {max_steps} step(s) maximum.
2. ALWAYS populate company_nos in every step's parameters:
   - User mentions a division name → map to correct number(s)
   - No division mentioned → use dashboard context: {req_co}
   - "all companies/group/overall" → ["3","4","5","6"]
3. Date rules (reference = {today_ref}):
   - "this month" → date_from=2026-02-01, date_to=2026-02-09
   - "last month" → date_from=2026-01-01, date_to=2026-01-31
   - "YTD" → date_from=2026-01-01, date_to=2026-02-09
   - "last 6 months" → date_from=2025-08-01, date_to=2026-02-09
   - "last year/2025" → date_from=2025-01-01, date_to=2025-12-31
   - "last 3 months" → date_from=2025-11-01, date_to=2026-02-09
   - "last 12 months" → date_from=2025-02-01, date_to=2026-02-09
4. explanation_analysis → plan multiple steps:
   Example "Why did sales drop?":
     Step 1: compare_current_vs_previous_month (identify the drop)
     Step 2: get_declining_product_groups (what drove the drop)
     Step 3: get_customer_movement_insights (who is responsible)
5. For single-intent questions, use ONE step only.
6. Pick the most appropriate tool for the intent.

Respond with ONLY valid JSON (no markdown):
{{
  "steps": [
    {{
      "tool_name": "tool_name_here",
      "parameters": {{"company_nos": [...], ...}},
      "purpose": "one-line explanation of why this step"
    }}
  ],
  "company_scope_used": "Using Retail only" | "Using all companies" | etc.
}}
"""

    try:
        client = _openai_client()
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=800,
        )
        data = json.loads(_clean_json(resp.choices[0].message.content))
        steps = data.get("steps", [])
        # Validate tool names
        valid_names = {t["name"] for t in TOOL_CATALOGUE}
        steps = [s for s in steps if s.get("tool_name") in valid_names]
        return steps[:3], data.get("company_scope_used", "")
    except Exception as e:
        logger.error(f"Step planning failed: {e}")
        return [], ""


# ─── Step 3: Execute a single tool ────────────────────────────────────────────

def execute_tool(
    db: Session,
    tool_name: str,
    parameters: dict[str, Any],
    request: AIInsightRequest,
) -> dict[str, Any]:
    """Execute a tool safely with validated, type-coerced parameters."""
    import inspect

    fn = _TOOL_FN_MAP.get(tool_name)
    if not fn:
        return {"error": f"Unknown tool: {tool_name}", "rows": []}

    parameters = _coerce_dates(parameters)

    # Build parameter pool — AI params win over request-level defaults
    pool: dict[str, Any] = {
        "db": db,
        "sale_scope": request.sale_scope or "all",
    }

    # Company resolution: AI planner wins, then request context, then all
    ai_co = parameters.get("company_nos")
    req_co = request.company_nos
    if ai_co:
        pool["company_nos"] = ai_co
    elif req_co:
        pool["company_nos"] = req_co
    else:
        pool["company_nos"] = ["3", "4", "5", "6"]

    # Merge AI params (skip company_nos, already handled)
    for k, v in parameters.items():
        if k != "company_nos":
            pool[k] = v

    # Request-level fallbacks (don't override AI params)
    if request.date_from:
        pool.setdefault("date_from", request.date_from)
    if request.date_to:
        pool.setdefault("date_to", request.date_to)
    if request.location:
        pool.setdefault("location", request.location)
    if request.salesperson:
        pool.setdefault("salesperson", request.salesperson)
    if request.item_group_code:
        pool.setdefault("item_group_code", request.item_group_code)
    if request.customer_code:
        pool.setdefault("customer_code", request.customer_code)

    pool = _coerce_dates(pool)

    # Only pass accepted params
    accepted = inspect.signature(fn).parameters
    filtered = {k: v for k, v in pool.items() if k in accepted}

    try:
        return fn(**filtered)
    except Exception as e:
        logger.error(f"Tool {tool_name} execution error: {e}", exc_info=True)
        return {"error": str(e), "rows": []}


# ─── Step 4: Synthesize response ──────────────────────────────────────────────

def synthesize_response(
    message: str,
    intent: str,
    steps_with_results: list[dict],
    request: AIInsightRequest,
    company_scope_used: str,
) -> AIInsightResponse:
    """Generate executive insight, chart, table, and follow-ups from all step results."""

    if not settings.openai_api_key:
        return AIInsightResponse(
            answer="OpenAI API key not configured.",
            tools_used=[s["step"]["tool_name"] for s in steps_with_results],
            intent=intent,
            company_scope=company_scope_used,
        )

    tools_used = [s["step"]["tool_name"] for s in steps_with_results]
    results_json = json.dumps(
        [{"tool": s["step"]["tool_name"], "purpose": s["step"].get("purpose", ""),
          "result": s["data"]}
         for s in steps_with_results],
        default=str, indent=2
    )

    # Build history context
    history_text = ""
    if request.history:
        turns = request.history[-6:]
        history_text = "\nConversation history:\n" + "\n".join(
            f"  {m.role.upper()}: {m.content}" for m in turns
        )

    co_nos = (steps_with_results[0]["step"]["parameters"].get("company_nos")
              if steps_with_results else request.company_nos)
    scope_sentence = company_scope_sentence(co_nos, request.sale_scope)

    prompt = f"""
{BUSINESS_GLOSSARY}
{history_text}

User question: "{message}"
Intent: {intent}
Company scope: {company_scope_used or scope_sentence}

Analysis results from {len(steps_with_results)} tool(s):
{results_json}

Generate a response as valid JSON only (no markdown fences):
{{
  "answer": "3-6 sentence executive insight that directly answers the question",
  "chart": {{
    "type": "bar|line|pie|none",
    "title": "descriptive title",
    "option": {{}}
  }},
  "table": {{
    "columns": ["Human Column Name", ...],
    "rows": [{{...}}, ...]
  }},
  "follow_up_questions": ["3-4 specific follow-up questions"],
  "assumptions": ["any notes about data or time period"],
  "warnings": ["any data quality or completeness concerns"]
}}

INSIGHT RULES:
- Open with the single most important number or finding.
- When results include company_no, break down by division
  (e.g. "Retail (Co.3): 245t, Manufacturing (Co.4): 180t…"). Never blend.
- Quote actual tonnage with units: "245.3t", "down 45t (-18%)".
- For customer churn: name customers + their typical monthly volume + days inactive.
- For projections: use cautious wording — "projected", "estimated", "based on current run rate".
- For declining: state the % and absolute change.
- End every answer with ONE specific actionable recommendation.
- If 0 rows returned: explain what that means and suggest a broader query.
- State the company scope clearly: "{company_scope_used or scope_sentence}"

CHART RULES:
- Sales trends over time → line chart. xAxis = months (string array), series per company/dimension.
- Rankings / comparisons → bar chart sorted descending, top 10–15 items max.
- Company share → pie chart with company division names as labels.
- Movement/stock/churn tables → set type "none" (table shows the data better).
- ECharts option must be complete valid JSON — NO JavaScript functions anywhere.
- Bar chart MUST include: xAxis.data (string array), series[0].data (number array), yAxis: {{}}.
- Line chart MUST include: xAxis.data (string array), series array with name + data arrays.
- Always include: tooltip: {{"trigger": "axis"}}, grid: {{"left": "5%", "right": "5%", "bottom": "15%", "containLabel": true}}.
- textStyle: {{"fontSize": 10}} on all axis labels.
- When company_no present, one series per division with division name (not number).

TABLE RULES:
- Always include a table for movement/stock/churn/ranking data.
- Column names MUST be human-readable: "Customer Name" not "customer_name".
- Include "Division" column mapping company_no → 3=Retail, 4=Manufacturing, 5=Engineering, 6=Mining.
- Colour hint: prefix declining values with "▼" and growing with "▲" in the value string.
- Limit table to 20 rows max.
- For churn: include "Days Inactive", "Last Purchase", "Avg Monthly Tonnes".
- For stock: include "Stock Status" with human labels.
- For decline: include "Recent 3M", "Prior 3M", "Change (t)", "Change (%)".
"""

    try:
        client = _openai_client()
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=4000,
        )
        data = json.loads(_clean_json(resp.choices[0].message.content))

        chart = None
        chart_data = data.get("chart", {})
        if chart_data and chart_data.get("type") not in ("none", None, ""):
            chart = AIChartConfig(
                type=chart_data["type"],
                title=chart_data.get("title", ""),
                option=chart_data.get("option", {}),
            )

        table = None
        table_data = data.get("table", {})
        if table_data and table_data.get("rows"):
            table = AITableResult(
                columns=table_data.get("columns", []),
                rows=table_data.get("rows", []),
            )

        return AIInsightResponse(
            answer=data.get("answer", "Analysis complete."),
            chart=chart,
            table=table,
            follow_up_questions=data.get("follow_up_questions", []),
            tools_used=tools_used,
            intent=intent,
            company_scope=company_scope_used or scope_sentence,
            assumptions=data.get("assumptions", []),
            warnings=data.get("warnings", []),
        )

    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error in synthesis: {e}")
        return AIInsightResponse(
            answer="Error parsing AI response. Please try again.",
            tools_used=tools_used,
            intent=intent,
            company_scope=company_scope_used,
        )
    except Exception as e:
        logger.error(f"Synthesis error: {e}", exc_info=True)
        return AIInsightResponse(
            answer=f"Error generating response: {str(e)}",
            tools_used=tools_used,
            intent=intent,
            company_scope=company_scope_used,
        )


# ─── Main orchestration ────────────────────────────────────────────────────────

async def generate_insight(db: Session, request: AIInsightRequest) -> AIInsightResponse:
    """Full orchestration: classify → plan → execute → synthesize."""

    if not settings.openai_api_key:
        return AIInsightResponse(
            answer="OpenAI API key is not configured. Please add OPENAI_API_KEY to secrets.",
            tools_used=[],
            company_scope="",
        )

    # 1. Classify intent
    intent = classify_intent(request.message)
    logger.info(f"AI intent: {intent} | question: {request.message[:80]}")

    # 2. Plan steps
    try:
        steps, company_scope_used = plan_steps(request.message, intent, request)
    except Exception as e:
        logger.error(f"Step planning error: {e}", exc_info=True)
        steps, company_scope_used = [], ""

    if not steps:
        co_nos = request.company_nos or ["3", "4", "5", "6"]
        return AIInsightResponse(
            answer=(
                "I can help with sales analytics across all divisions. "
                "Try asking about trends, product performance, customer activity, stock, or projections."
            ),
            follow_up_questions=[
                "Show sales trend for the last 6 months by division",
                "Which customers stopped buying in the last 60 days?",
                "Which product groups are declining this quarter?",
                "Project this month's sales",
                "Compare internal vs external sales",
                "Which products should sales focus on?",
            ],
            tools_used=[],
            intent=intent,
            company_scope=company_scope_sentence(co_nos, request.sale_scope),
        )

    # 3. Execute steps
    steps_with_results = []
    for step in steps:
        logger.info(f"Executing tool: {step['tool_name']} | params: {step.get('parameters', {})}")
        result = execute_tool(db, step["tool_name"], step.get("parameters", {}), request)
        steps_with_results.append({"step": step, "data": result})

    # 4. Synthesize
    return synthesize_response(
        request.message, intent, steps_with_results, request, company_scope_used
    )


# ─── Suggested questions ───────────────────────────────────────────────────────

def get_suggested_questions() -> list[dict[str, str]]:
    return [
        {"text": "Show sales trend for the last 12 months by division", "icon": "📈"},
        {"text": "Which product groups declined the most this quarter?", "icon": "📉"},
        {"text": "Compare internal vs external sales", "icon": "🔄"},
        {"text": "Which customers stopped buying?", "icon": "🚨"},
        {"text": "Project this month's sales", "icon": "🔮"},
        {"text": "Which products should sales focus on?", "icon": "🎯"},
        {"text": "Show top 10 customers in Retail", "icon": "🏆"},
        {"text": "Why did sales drop this month?", "icon": "🔍"},
    ]
