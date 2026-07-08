"""
API routes for AI Insights.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.ai import AIInsightRequest, AIInsightResponse, AISuggestion
from app.services.ai_insights_service import generate_insight, get_suggested_questions

router = APIRouter(prefix="/api/ai", tags=["AI Insights"])


@router.post("/insights", response_model=AIInsightResponse)
async def ask_ai_insight(
    request: AIInsightRequest,
    db: Annotated[Session, Depends(get_db)],
) -> AIInsightResponse:
    """
    Ask the AI for sales insights.

    Request body:
    - message: User question or request
    - history: Optional chat history
    - date_from, date_to, location, etc: Optional filters

    Response:
    - answer: Executive insight
    - chart: Optional ECharts configuration
    - table: Optional table data
    - follow_up_questions: Suggested next questions
    """

    try:
        response = await generate_insight(db, request)
        return response
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error generating insight: {str(e)}"
        )


@router.get("/suggestions", response_model=list[AISuggestion])
async def get_ai_suggestions() -> list[AISuggestion]:
    """
    Get suggested questions for the user.
    """

    suggestions = get_suggested_questions()
    return [AISuggestion(text=s["text"], icon=s.get("icon")) for s in suggestions]
