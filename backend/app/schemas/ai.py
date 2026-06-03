"""
Pydantic schemas for AI insights module.
"""

from datetime import date
from typing import Any, Optional

from pydantic import BaseModel, Field


class AIChatMessage(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    content: str


class DashboardContext(BaseModel):
    """Current dashboard state — passed so AI understands 'this' / 'current' references."""
    page: Optional[str] = Field(default=None, description="home | movement | stock")
    selected_salesperson: Optional[str] = None
    selected_location: Optional[str] = None
    selected_item_group: Optional[str] = None
    selected_customer: Optional[str] = None


class AIInsightRequest(BaseModel):
    message: str
    history: Optional[list[AIChatMessage]] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    location: Optional[str] = None
    salesperson: Optional[str] = None
    item_group_code: Optional[str] = None
    customer_code: Optional[str] = None
    company_nos: Optional[list[str]] = Field(default=None, description="e.g. ['3','5']")
    sale_scope: Optional[str] = Field(default="all", description="all | external | internal")
    dashboard_context: Optional[DashboardContext] = None


class AIChartConfig(BaseModel):
    type: str = Field(..., description="bar | line | pie | none")
    title: str
    option: dict[str, Any]


class AITableResult(BaseModel):
    columns: list[str]
    rows: list[dict[str, Any]]


class AIInsightResponse(BaseModel):
    answer: str
    chart: Optional[AIChartConfig] = None
    table: Optional[AITableResult] = None
    follow_up_questions: list[str] = Field(default_factory=list)
    tools_used: list[str] = Field(default_factory=list)
    intent: Optional[str] = None
    company_scope: Optional[str] = None
    assumptions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class AISuggestion(BaseModel):
    text: str
    icon: Optional[str] = None
