"""
AI Insights Service: Two-step orchestration using GPT-5.
Step 1: Intent planning (choose tool)
Step 2: Execute and generate final response
"""

import json
import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.schemas.ai import AIInsightRequest, AIInsightResponse, AIChartConfig, AITableResult
from app.services import analytics_tools

logger = logging.getLogger(__name__)

# Tool metadata for intent planning
AVAILABLE_TOOLS = [
    {
        "name": "get_sales_trend",
        "description": "Get sales trend data over time, grouped by item group, customer, salesperson, or location",
        "parameters": {
            "dimension": "total | item_group | customer | salesperson | location",
            "date_from": "Optional start date",
            "date_to": "Optional end date",
            "location": "Optional location filter",
            "salesperson": "Optional salesperson filter",
            "item_group_code": "Optional item group filter",
        },
    },
    {
        "name": "get_sales_by_item_group",
        "description": "Get sales totals by item group/product category",
        "parameters": {
            "date_from": "Optional start date",
            "date_to": "Optional end date",
            "location": "Optional location filter",
            "salesperson": "Optional salesperson filter",
        },
    },
    {
        "name": "get_sales_by_customer",
        "description": "Get sales totals by customer, ranked by tonnage",
        "parameters": {
            "date_from": "Optional start date",
            "date_to": "Optional end date",
            "location": "Optional location filter",
            "item_group_code": "Optional item group filter",
            "salesperson": "Optional salesperson filter",
        },
    },
    {
        "name": "get_sales_by_salesperson",
        "description": "Get sales totals by salesperson performance",
        "parameters": {
            "date_from": "Optional start date",
            "date_to": "Optional end date",
            "location": "Optional location filter",
            "item_group_code": "Optional item group filter",
        },
    },
    {
        "name": "get_sales_by_location",
        "description": "Get sales totals by location/region",
        "parameters": {
            "date_from": "Optional start date",
            "date_to": "Optional end date",
            "item_group_code": "Optional item group filter",
            "salesperson": "Optional salesperson filter",
        },
    },
    {
        "name": "get_customer_movement_insights",
        "description": "Get declining, stopped, or at-risk customers and their tonnage gaps",
        "parameters": {
            "action_band": "Optional action band filter",
            "product_group_code": "Optional product group filter",
        },
    },
    {
        "name": "compare_current_vs_previous_month",
        "description": "Compare current month sales vs previous month by various dimensions",
        "parameters": {
            "dimension": "total | item_group | customer | salesperson | location",
        },
    },
]


def plan_intent(message: str) -> dict[str, Any]:
    """
    Step 1: Ask GPT-5 to choose the right tool and parameters.
    Returns: {"tool_name": "...", "parameters": {...}}
    """

    if not settings.openai_api_key:
        logger.warning("OpenAI API key not configured")
        return {"tool_name": "clarify", "parameters": {}, "reason": "API not configured"}

    try:
        from openai import OpenAI
        import httpx

        # Create httpx client without proxy interference
        http_client = httpx.Client(mounts=None)
        client = OpenAI(api_key=settings.openai_api_key, http_client=http_client)

        tools_desc = json.dumps(AVAILABLE_TOOLS, indent=2)

        prompt = f"""
You are an analytics assistant for a sales dashboard. Analyze the user's question and choose the most appropriate tool.

Available tools:
{tools_desc}

User question: {message}

Respond with ONLY a JSON object (no extra text):
{{
  "tool_name": "name_of_tool_or_clarify",
  "parameters": {{}},
  "reason": "brief explanation"
}}

If the question is unclear or no tool matches, use tool_name "clarify".
"""

        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=500,
        )

        response_text = response.choices[0].message.content.strip()

        # Strip markdown code fences if present
        if response_text.startswith("```"):
            lines = response_text.splitlines()
            response_text = "\n".join(
                line for line in lines
                if not line.startswith("```")
            ).strip()

        # Parse JSON response
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
        "get_customer_movement_insights": analytics_tools.get_customer_movement_insights,
        "compare_current_vs_previous_month": analytics_tools.compare_current_vs_previous_month,
    }

    fn = tool_fn_map.get(tool_name)
    if not fn:
        return {"error": f"Unknown tool: {tool_name}"}

    # Build full candidate params pool
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
        params_pool.setdefault("company_nos", request.company_nos)
    if request.sale_scope:
        params_pool.setdefault("sale_scope", request.sale_scope)

    # Only pass params the function actually accepts — avoids unexpected keyword errors
    accepted = inspect.signature(fn).parameters
    filtered_params = {k: v for k, v in params_pool.items() if k in accepted}

    return fn(**filtered_params)


def generate_final_response(
    message: str, tool_result: dict[str, Any], tool_name: str
) -> AIInsightResponse:
    """
    Step 3: Ask GPT-5 to generate final insight response with chart and follow-ups.
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

        # Create httpx client without proxy interference
        http_client = httpx.Client(mounts=None)
        client = OpenAI(api_key=settings.openai_api_key, http_client=http_client)

        tool_result_json = json.dumps(tool_result, default=str)

        prompt = f"""
You are a sales analytics expert. Based on the tool result, generate an executive insight.

User's original question: {message}

Tool result:
{tool_result_json}

Respond with ONLY valid JSON (no markdown, no extra text):
{{
  "answer": "1-2 sentence executive insight",
  "chart": {{
    "type": "bar|line|pie|none",
    "title": "descriptive title",
    "option": {{}}  // Apache ECharts option object
  }},
  "table": {{
    "columns": ["col1", "col2"],
    "rows": [{{}}, {{}}]
  }},
  "follow_up_questions": ["question1", "question2"],
  "tool_used": "{tool_name}",
  "assumptions": ["assumption1"]
}}

Chart rules:
- For trends use line chart
- For rankings/comparisons use bar chart
- For composition use pie chart
- Make the ECharts option valid and complete JSON (no functions)
- If no chart is appropriate, set type to "none" and option to {{}}
- For bar charts, include xAxis data array and series data array
- For line charts, include xAxis categories and series with line type

Table rules:
- Only include if tool result has rows
- Keep to 5-10 columns max
- Include numeric values for easy scanning
"""

        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=2000,
        )

        response_text = response.choices[0].message.content.strip()

        # Strip markdown code fences if present
        if response_text.startswith("```"):
            lines = response_text.splitlines()
            response_text = "\n".join(
                line for line in lines
                if not line.startswith("```")
            ).strip()

        # Parse JSON
        data = json.loads(response_text)

        # Build response with chart
        chart_config = None
        if data.get("chart") and data["chart"].get("type") != "none":
            chart_config = AIChartConfig(
                type=data["chart"]["type"],
                title=data["chart"]["title"],
                option=data["chart"].get("option", {}),
            )

        table_result = None
        if data.get("table"):
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
    Main orchestration: intent -> tool execution -> final response.
    """

    # Step 1: Plan intent
    intent = plan_intent(request.message)
    tool_name = intent.get("tool_name", "clarify")
    parameters = intent.get("parameters", {})

    if tool_name == "clarify":
        return AIInsightResponse(
            answer=f"I need clarification: {intent.get('reason', 'Please ask about sales trends, customers, product groups, or performance metrics.')}",
            chart=None,
            table=None,
            follow_up_questions=[
                "Show sales trend for the last 6 months",
                "Which product groups are declining?",
                "Show top 10 customers",
            ],
            tool_used=None,
            assumptions=[],
        )

    # Step 2: Execute tool
    try:
        tool_result = execute_tool(db, tool_name, parameters, request)
    except Exception as e:
        logger.error(f"Tool execution error: {e}")
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
        {"text": "Show sales trend for the last 6 months", "icon": "📈"},
        {"text": "Which product groups are declining?", "icon": "📉"},
        {"text": "Show top 10 customers by tonnage", "icon": "🏆"},
        {"text": "Compare current month vs previous month", "icon": "📊"},
        {"text": "Which customers stopped buying?", "icon": "🚨"},
        {"text": "Show salesperson performance this month", "icon": "👤"},
    ]
