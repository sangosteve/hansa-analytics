from datetime import date

from pydantic import BaseModel, Field


class TransactionRefreshRequest(BaseModel):
    date_from: date = Field(..., description="2024-01-01")
    date_to: date = Field(..., description="2025-12-31")