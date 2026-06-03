---
name: AI Insights architecture
description: How the AI Insights module is structured — orchestration flow, tool catalogue, company mapping, multi-step planning
---

## Orchestration flow (ai_insights_service.py)
1. `classify_intent()` — single cheap AI call, returns one of 11 intent types
2. `plan_steps()` — AI plans 1–3 tool calls with full parameters; explanation_analysis gets up to 3
3. `execute_tool()` per step — safe parameter validation, calls analytics_tools.py only
4. `synthesize_response()` — receives all step results + history, generates answer/chart/table

## Business context (business_context.py)
Single source of truth imported everywhere:
- COMPANY_MAP: {3:Retail, 4:Manufacturing, 5:Engineering, 6:Mining}
- ACTIVE_COMPANIES: ["3","4","5","6"]
- BUSINESS_GLOSSARY: injected into every AI prompt
- INTERNAL_CUSTOMER_CODES: PSS002, PSS003U … etc.
- company_scope_sentence() — returns scope label for response disclosure

## Tool catalogue (17 tools)
analytics_tools.py — all use SQLAlchemy, no raw SQL in service layer.
New tools added: get_sales_by_company, get_internal_vs_external_sales, project_month_end_sales, get_fast_movers, get_slow_movers, identify_products_to_push, get_top_growing_groups (alias of declining filter)

**Why:** AI must only access data through approved tools — no arbitrary SQL. Tools enforce company_nos + sale_scope on every query.

## Data facts
- fact_sales_lines: companies 3,4,5,6; July 2024 → Feb 9, 2026
- customer_product_group_movement table: EMPTY — all churn/movement queries use fact_sales_lines directly
- Internal/external split (6-month window): ~75.5% external, ~24.5% internal
- Company tonnage share: Retail(3)=52%, Manufacturing(4)=32%, Engineering(5)=9%, Mining(6)=7%

## Frontend (ai-insights-panel.tsx)
- Full conversation history: array of ConversationTurn[] with multi-turn chat
- Context label in header shows active company/scope
- ResponseCard: answer + ScopeBadge + WarningBadge + chart + expandable table + follow-up chips
- Negative value cells auto-coloured red, positive green in tables
- ToolBadge shows which analysis was run

## Schema
AIInsightResponse: answer, chart, table, follow_up_questions, tools_used (list), intent, company_scope, assumptions, warnings
AIInsightRequest: added dashboard_context (DashboardContext) + history field
