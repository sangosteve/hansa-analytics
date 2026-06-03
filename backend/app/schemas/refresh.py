from datetime import date
from typing import Optional

from pydantic import BaseModel, Field

from app.core.config import settings


class TransactionRefreshRequest(BaseModel):
    date_from: date = Field(..., description="Start date e.g. 2024-01-01")
    date_to: date = Field(..., description="End date e.g. 2025-12-31")
    company_no: Optional[str] = Field(
        default=None,
        description="Hansa company number to refresh (defaults to HANSA_COMPANY_NO env var). "
                    "Pass '3', '4', '5', or '6' for specific divisions.",
    )

    def resolved_company_no(self) -> str:
        return self.company_no or settings.hansa_company_no


class MasterDataRefreshRequest(BaseModel):
    company_no: Optional[str] = Field(
        default=None,
        description="Master data company (defaults to HANSA_MASTER_COMPANY_NO env var). "
                    "Company 1 is the shared master data source.",
    )

    def resolved_company_no(self) -> str:
        return self.company_no or settings.hansa_master_company_no
