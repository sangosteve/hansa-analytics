"""
AI Insights Service: Two-step orchestration.
Step 1: Intent planning (choose tool + parameters)
Step 2: Execute tool → generate final response with chart/table
"""

import json
import logging
from datetime import date
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.schemas.ai import AIInsightRequest, AIInsightResponse, AIChartConfig, AITableResult
from app.services import analytics_tools

logger = logging.getLogger(__name__)

# ─── Business context injected into every AI prompt ───────────────────────────
BUSINESS_CONTEXT = """
You are the AI analyst for Hansa Analytics — a sales intelligence platform for a multi-division
commodities/distribution business running on HansaWorld (Standard ERP).

KEY BUSINESS FACTS:
- The business has 4 divisions (also called companies or company numbers): 3, 4, 5, and 6.
  These may be referred to as divisions like Retail, Manufacturing, Wholesale, or other names.
  When a user says "retail division" or "manufacturing", map it to the relevant company number(s).
- Sales volume is always measured in TONNES. This is the primary performance metric.
- Data covers sales transactions, customer buying patterns, and live stock levels.
- The customer_movement table tracks buying regularity — it shows 6-month averages, current-month
  tonnage, gaps vs expectations, buyer status (active/at-risk/stopped/churned), and action bands.
- "Stopped buying" = customers with high days_since_last_purchase and previously regular buying.
- "Declining" = customers or product groups where recent volume is significantly below prior periods.
- Stock is tracked per item per location. Stock status categories: critical_low (<0.5 months cover),
  low_stock (<1.5 months), adequate (1.5–4 months), overstocked (>4 months).
- "Products to stock" means items with high sales velocity but low months_of_cover.
- Common date references: "this month" = current month, "last quarter" = last 3 months,
  "YTD" = year to date from January.

COMPANY NUMBER MAPPING (use these when the user mentions a division):
- Use company_nos: ["3","4","5","6"] for "all divisions" or when unspecified
- Use a specific company_no when the user names a specific division
"""

# ─── Available tools ───────────────────────────────────────────────────────────
AVAILABLE_TOOLS = [
    {
        "name": "get_sales_trend",
        "description": (
            "Monthly sales trend over time. Use for: overall trends, trends by product group, "
            "customer, salesperson, or location. Good for 'how are sales trending', 'show me "
            "sales over time', 'YTD performance', 'which months were best'."
        ),
        "parameters": {
            "dimension": "total | item_group | customer | salesperson | location",
            "date_from": "ISO date string YYYY-MM-DD (optional)",
            "date_to": "ISO date string YYYY-MM-DD (optional)",
            "location": "Optional location/branch name filter",
            "salesperson": "Optional salesperson name filter",
            "item_group_code": "Optional product group code filter",
        },
    },
    {
        "name": "get_sales_by_item_group",
        "description": (
            "Total sales ranked by product group/category for a period. Use for: "
            "'which products sell most', 'top product groups', 'product mix', "
            "'what are we selling'. Returns bar chart ready data."
        ),
        "parameters": {
            "date_from": "ISO date string YYYY-MM-DD (optional)",
            "date_to": "ISO date string YYYY-MM-DD (optional)",
            "location": "Optional location filter",
            "salesperson": "Optional salesperson filter",
        },
    },
    {
        "name": "get_sales_by_customer",
        "description": (
            "Total sales ranked by customer for a period. Use for: 'top customers', "
            "'biggest buyers', 'customer ranking', 'who buys the most'. Returns bar chart."
        ),
        "parameters": {
            "date_from": "ISO date string YYYY-MM-DD (optional)",
            "date_to": "ISO date string YYYY-MM-DD (optional)",
            "location": "Optional location filter",
            "item_group_code": "Optional product group filter",
            "salesperson": "Optional salesperson filter",
        },
    },
    {
        "name": "get_sales_by_salesperson",
        "description": (
            "Sales performance ranked by salesperson. Use for: 'salesperson performance', "
            "'who is selling most', 'sales team ranking', 'rep performance'."
        ),
        "parameters": {
            "date_from": "ISO date string YYYY-MM-DD (optional)",
            "date_to": "ISO date string YYYY-MM-DD (optional)",
            "location": "Optional location filter",
            "item_group_code": "Optional product group filter",
        },
    },
    {
        "name": "get_sales_by_location",
        "description": (
            "Sales totals ranked by branch/location/region. Use for: 'branch performance', "
            "'which location sells most', 'regional breakdown'."
        ),
        "parameters": {
            "date_from": "ISO date string YYYY-MM-DD (optional)",
            "date_to": "ISO date string YYYY-MM-DD (optional)",
            "item_group_code": "Optional product group filter",
            "salesperson": "Optional salesperson filter",
        },
    },
    {
        "name": "get_declining_product_groups",
        "description": (
            "Compare product group sales: recent 3 months vs prior 3 months to find what is "
            "growing or declining. Use for: 'which products are declining', 'product trends', "
            "'what products are losing volume', 'which categories are growing/shrinking'."
        ),
        "parameters": {
            "location": "Optional location filter",
            "salesperson": "Optional salesperson filter",
        },
    },
    {
        "name": "get_churned_customers",
        "description": (
            "Customers who used to buy regularly but have stopped — sorted by their historical "
            "volume (highest loss first). Use for: 'which customers stopped buying', "
            "'lost customers', 'customer churn', 'who haven't we seen in a while', "
            "'customers we lost', 'inactive customers who were big buyers'."
        ),
        "parameters": {
            "days_inactive": "Number of days of inactivity to qualify as churned (default 60)",
            "product_group_code": "Optional product group filter",
            "location": "Optional location filter",
            "salesperson": "Optional salesperson filter",
        },
    },
    {
        "name": "get_customer_movement_insights",
        "description": (
            "At-risk and declining customers with their tonnage gaps vs expectations. Use for: "
            "'at-risk customers', 'declining customers', 'customers buying less than expected', "
            "'customer health', 'who needs a call', 'action required customers'."
        ),
        "parameters": {
            "action_band": "Optional action band filter (e.g. 'Urgent', 'Watch')",
            "buyer_status": "Optional buyer status filter",
            "product_group_code": "Optional product group filter",
        },
    },
    {
        "name": "get_stock_recommendations",
        "description": (
            "Stock analysis: items with high sales velocity vs current stock levels. Use for: "
            "'what should we stock', 'which products to order', 'low stock alerts', "
            "'stock recommendations', 'what are we running out of', 'overstocked items', "
            "'inventory health', 'reorder suggestions'."
        ),
        "parameters": {
            "location": "Optional location/branch filter",
            "item_group_code": "Optional product group filter",
        },
    },
    {
        "name": "compare_current_vs_previous_month",
        "description": (
            "Month-over-month comparison of sales tonnage. Use for: 'how is this month going', "
            "'compare to last month', 'MoM growth', 'are we up or down vs last month'."
        ),
        "parameters": {
            "dimension": "total | item_group | customer | salesperson | location",
        },
    },
]


def _coerce_dates(parameters: dict[str, Any]) -> dict[str, Any]:
    """Convert any ISO date strings to Python date objects so SQLAlchemy comparisons work."""
    coerced = dict(parameters)
    for key in ("date_from", "date_to"):
        val = coerced.get(key)
        if isinstance(val, str) and val:
            try:
                coerced[key] = date.fromisoformat(val[:10])
            except ValueError:
                coerced.pop(key, None)
        elif val is not None and not isinstance(val, date):
            coerced.pop(key, None)
    return coerced


def plan_intent(message: str) -> dict[str, Any]:
    """
    Step 1: Ask the AI to choose the right tool and parameters.
    Returns: {"tool_name": "...", "parameters": {...}}
    """

    if not settings.openai_api_key:
        logger.warning("OpenAI API key not configured")
        return {"tool_name": "clarify", "parameters": {}, "reason": "API not configured"}

    try:
        from openai import OpenAI
        import httpx

        http_client = httpx.Client(mounts=None)
        client = OpenAI(api_key=settings.openai_api_key, http_client=http_client)

        tools_desc = json.dumps(AVAILABLE_TOOLS, indent=2)
        today = date.today().isoformat()

        prompt = f"""
{BUSINESS_CONTEXT}

Today's date: {today}

Your task: Given the user's question, choose the BEST analytics tool and provide parameters.

Available tools:
{tools_desc}

User question: "{message}"

Rules:
- For date ranges, compute actual ISO dates (YYYY-MM-DD). E.g. "last 6 months" = from {(date.today().replace(day=1))}
  back 6 months. "YTD" = from {date.today().year}-01-01 to {today}.
- For "declining products/product groups" → use get_declining_product_groups
- For "stopped buying / churned / lost customers" → use get_churned_customers
- For "at-risk / declining customers" → use get_customer_movement_insights
- For "what to stock / low stock / inventory" → use get_stock_recommendations
- For general sales trends over time → use get_sales_trend with the right dimension
- Only use "clarify" if the question is completely unrelated to sales, customers, products, or stock.

Respond with ONLY a JSON object (no extra text, no markdown):
{{
  "tool_name": "name_of_tool",
  "parameters": {{}},
  "reason": "brief explanation"
}}
"""

        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=600,
        )

        response_text = response.choices[0].message.content.strip()

        if response_text.startswith("```"):
            lines = response_text.splitlines()
            response_text = "\n".join(
                line for line in lines if not line.startswith("```")
            ).strip()

        result = json.loads(response_text)
        return result

    except Exception as e:
        logger.error(f"Intent planning error: {e}")
        return {
            "tool_name": "clarify",
            "parameters": {},
            "reason": f"Error planning intent: {str(e)}",
        }


def execute_tool(
    db: Session, tool_name: str, parameters: dict[str, Any], request: AIInsightRequest
) -> dict[str, Any]:
    """Execute the chosen analytics tool with validated parameters."""
    import inspect

    tool_fn_map = {
        "get_sales_trend": analytics_tools.get_sales_trend,
        "get_sales_by_item_group": analytics_tools.get_sales_by_item_group,
        "get_sales_by_customer": analytics_tools.get_sales_by_customer,
        "get_sales_by_salesperson": analytics_tools.get_sales_by_salesperson,
        "get_sales_by_location": analytics_tools.get_sales_by_location,
        "get_declining_product_groups": analytics_tools.get_declining_product_groups,
        "get_churned_customers": analytics_tools.get_churned_customers,
        "get_customer_movement_insights": analytics_tools.get_customer_movement_insights,
        "get_stock_recommendations": analytics_tools.get_stock_recommendations,
        "compare_current_vs_previous_month": analytics_tools.compare_current_vs_previous_month,
    }

    fn = tool_fn_map.get(tool_name)
    if not fn:
        return {"error": f"Unknown tool: {tool_name}"}

    # Coerce any string dates to date objects BEFORE building the params pool
    parameters = _coerce_dates(parameters)

    params_pool: dict[str, Any] = {
        "db": db,
        "company_nos": request.company_nos or ["all"],
        "sale_scope": request.sale_scope or "all",
        **parameters,
    }

    # Apply request-level filters (don't override explicit planner params)
    if request.date_from:
        params_pool.setdefault("date_from", request.date_from)
    if request.date_to:
        params_pool.setdefault("date_to", request.date_to)
    if request.location:
        params_pool.setdefault("location", request.location)
    if request.salesperson:
        params_pool.setdefault("salesperson", request.salesperson)
    if request.item_group_code:
        params_pool.setdefault("item_group_code", request.item_group_code)
    if request.customer_code:
        params_pool.setdefault("customer_code", request.customer_code)
    if request.company_nos:
        params_pool["company_nos"] = request.company_nos
    if request.sale_scope:
        params_pool["sale_scope"] = request.sale_scope

    # Coerce dates that came from the request object too
    params_pool = _coerce_dates(params_pool)

    # Only pass params the function actually accepts
    accepted = inspect.signature(fn).parameters
    filtered_params = {k: v for k, v in params_pool.items() if k in accepted}

    return fn(**filtered_params)


def generate_final_response(
    message: str, tool_result: dict[str, Any], tool_name: str
) -> AIInsightResponse:
    """
    Step 2: Ask the AI to generate the final insight with chart/table from the tool result.
    """

    if not settings.openai_api_key:
        return AIInsightResponse(
            answer="API key not configured. Cannot generate insights.",
            chart=None,
            table=None,
            follow_up_questions=[],
            tool_used=tool_name,
            assumptions=[],
        )

    try:
        from openai import OpenAI
        import httpx

        http_client = httpx.Client(mounts=None)
        client = OpenAI(api_key=settings.openai_api_key, http_client=http_client)

        tool_result_json = json.dumps(tool_result, default=str)
        row_count = len(tool_result.get("rows", []))

        prompt = f"""
{BUSINESS_CONTEXT}

Your task: Analyze the tool result and give an executive-level insight for the user's question.

User's question: "{message}"
Tool used: {tool_name}
Tool result ({row_count} rows):
{tool_result_json}

Respond with ONLY valid JSON (no markdown, no extra text):
{{
  "answer": "2-4 sentence executive insight that directly answers the question with specific numbers and actionable commentary. Name the top items. Highlight the most important finding.",
  "chart": {{
    "type": "bar|line|pie|none",
    "title": "descriptive chart title",
    "option": {{}}
  }},
  "table": {{
    "columns": ["Column Name 1", "Column Name 2"],
    "rows": [{{}}, {{}}]
  }},
  "follow_up_questions": ["3-4 specific follow-up questions relevant to this result"],
  "tool_used": "{tool_name}",
  "assumptions": ["any important assumptions or notes about the data"]
}}

CHART RULES:
- Trends over time → line chart (xAxis: months, series per dimension)
- Rankings/totals → bar chart (sorted by value descending, show top 10-15 items)
- Composition/share → pie chart
- Movement/stock tables → set type "none" (table is better)
- ECharts option must be complete valid JSON — no JavaScript functions
- For bar: include xAxis.data (array of labels) and series[0].data (array of numbers)
- For line with multiple series: include legend.data, xAxis.data, and series array
- Always include tooltip: {{"trigger": "axis"}} and reasonable grid padding
- Label values to 1 decimal place using formatter in label config

TABLE RULES:
- Always include a table for movement/stock/customer data
- Column names should be human-readable (e.g. "Customer Name" not "customer_name")
- For declining data: include change columns with +/- signs
- Limit to top 15 rows in the table
- For stock: include "Stock Status" column with clear labels

INSIGHT RULES:
- Lead with the single most important finding
- Include specific tonnage numbers
- Mention specific customer/product names from the top results
- For declining: quantify the drop (e.g. "down 45t or -23%")
- For churned customers: mention how long they've been inactive and their typical volume
- For stock: name the specific items at risk and their months of cover
- End with a brief actionable recommendation
"""

        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=3000,
        )

        response_text = response.choices[0].message.content.strip()

        if response_text.startswith("```"):
            lines = response_text.splitlines()
            response_text = "\n".join(
                line for line in lines if not line.startswith("```")
            ).strip()

        data = json.loads(response_text)

        chart_config = None
        if data.get("chart") and data["chart"].get("type") not in ("none", None):
            chart_config = AIChartConfig(
                type=data["chart"]["type"],
                title=data["chart"]["title"],
                option=data["chart"].get("option", {}),
            )

        table_result = None
        if data.get("table") and data["table"].get("rows"):
            table_result = AITableResult(
                columns=data["table"].get("columns", []),
                rows=data["table"].get("rows", []),
            )

        return AIInsightResponse(
            answer=data.get("answer", "Analysis complete."),
            chart=chart_config,
            table=table_result,
            follow_up_questions=data.get("follow_up_questions", []),
            tool_used=tool_name,
            assumptions=data.get("assumptions", []),
        )

    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error in final response: {e}")
        return AIInsightResponse(
            answer="Error parsing AI response. Please try again.",
            chart=None,
            table=None,
            follow_up_questions=[],
            tool_used=tool_name,
            assumptions=[],
        )
    except Exception as e:
        logger.error(f"Final response generation error: {e}")
        return AIInsightResponse(
            answer=f"Error generating response: {str(e)}",
            chart=None,
            table=None,
            follow_up_questions=[],
            tool_used=tool_name,
            assumptions=[],
        )


async def generate_insight(
    db: Session, request: AIInsightRequest
) -> AIInsightResponse:
    """
    Main orchestration: plan intent → execute tool → generate response.
    """

    # Step 1: Plan intent
    intent = plan_intent(request.message)
    tool_name = intent.get("tool_name", "clarify")
    parameters = intent.get("parameters", {})

    if tool_name == "clarify":
        return AIInsightResponse(
            answer=f"I can help with sales and business analytics. {intent.get('reason', '')} Try asking about sales trends, product performance, customer activity, or stock levels.",
            chart=None,
            table=None,
            follow_up_questions=[
                "Which product groups are declining this quarter?",
                "Which customers have stopped buying?",
                "What products should we stock up on?",
                "Show me sales trend for the last 6 months",
                "Who are our top 10 customers?",
            ],
            tool_used=None,
            assumptions=[],
        )

    # Step 2: Execute tool
    try:
        tool_result = execute_tool(db, tool_name, parameters, request)
    except Exception as e:
        logger.error(f"Tool execution error: {e}", exc_info=True)
        return AIInsightResponse(
            answer=f"Error executing analysis: {str(e)}",
            chart=None,
            table=None,
            follow_up_questions=[],
            tool_used=tool_name,
            assumptions=[],
        )

    # Step 3: Generate final response
    response = generate_final_response(request.message, tool_result, tool_name)
    return response


def get_suggested_questions() -> list[dict[str, str]]:
    """Return suggested questions for the user."""

    return [
        {"text": "Which product groups are declining?", "icon": "📉"},
        {"text": "Which customers stopped buying?", "icon": "🚨"},
        {"text": "What products should we stock?", "icon": "📦"},
        {"text": "Show sales trend for the last 12 months", "icon": "📈"},
        {"text": "Who are our top 10 customers?", "icon": "🏆"},
        {"text": "Compare this month vs last month", "icon": "📊"},
        {"text": "Which customers are at risk of churning?", "icon": "⚠️"},
        {"text": "Show salesperson performance this year", "icon": "👤"},
    ]
