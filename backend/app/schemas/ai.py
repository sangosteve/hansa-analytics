"""
Pydantic schemas for AI insights module.
"""

from datetime import date
from typing import Any, Optional

from pydantic import BaseModel, Field


class AIChatMessage(BaseModel):
    """Single chat message in conversation history."""

    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")


class AIInsightRequest(BaseModel):
    """Request for AI insight generation."""

    message: str = Field(..., description="User question or request")
    history: Optional[list[AIChatMessage]] = Field(
        default=None, description="Optional chat history"
    )
    date_from: Optional[date] = Field(default=None, description="Start date for analysis")
    date_to: Optional[date] = Field(default=None, description="End date for analysis")
    location: Optional[str] = Field(default=None, description="Filter by location")
    salesperson: Optional[str] = Field(default=None, description="Filter by salesperson")
    item_group_code: Optional[str] = Field(
        default=None, description="Filter by item group code"
    )
    customer_code: Optional[str] = Field(default=None, description="Filter by customer code")


class AIChartConfig(BaseModel):
    """Apache ECharts configuration object."""

    type: str = Field(..., description="Chart type: bar, line, pie, none")
    title: str = Field(..., description="Chart title")
    option: dict[str, Any] = Field(..., description="ECharts option object")


class AITableResult(BaseModel):
    """Table data result."""

    columns: list[str] = Field(..., description="Column names")
    rows: list[dict[str, Any]] = Field(..., description="Table rows as dictionaries")


class AIInsightResponse(BaseModel):
    """Response with AI insight, optional chart, and follow-up questions."""

    answer: str = Field(..., description="Executive summary insight")
    chart: Optional[AIChartConfig] = Field(default=None, description="Optional chart config")
    table: Optional[AITableResult] = Field(default=None, description="Optional table data")
    follow_up_questions: list[str] = Field(
        default_factory=list, description="Suggested follow-up questions"
    )
    tool_used: Optional[str] = Field(default=None, description="Which tool was used")
    assumptions: list[str] = Field(
        default_factory=list, description="Assumptions made in analysis"
    )


class AISuggestion(BaseModel):
    """Suggested question for user."""

    text: str = Field(..., description="Question text")
    icon: Optional[str] = Field(default=None, description="Optional emoji/icon")
