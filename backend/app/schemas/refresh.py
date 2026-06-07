from datetime import date
from typing import List, Optional

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


class RefreshSettingsSchema(BaseModel):
    active_companies: List[str] = Field(default=["3", "4", "5", "6"])
    refresh_mode: str = Field(
        default="last_success_buffer",
        description="last_success_buffer | last_n_days | current_month | ytd",
    )
    safety_buffer_days: int = Field(default=2, ge=0, le=90)
    last_n_days: int = Field(default=30, ge=1, le=730)
    include_master: bool = Field(default=True)
    include_invoices: bool = Field(default=True)
    include_deliveries: bool = Field(default=True)
    include_orders: bool = Field(default=False)
    include_receipts: bool = Field(default=False)
    include_gl_accounts: bool = Field(default=False)
    include_gl_transactions: bool = Field(default=False)
    rebuild_facts: bool = Field(default=True)
    rebuild_movement: bool = Field(default=True)
    rebuild_stock: bool = Field(default=True)
    schedule_enabled: bool = Field(default=False)
    schedule_frequency: str = Field(default="daily", description="daily | weekly | monthly")
    schedule_time: str = Field(default="02:00", description="HH:MM server time")


class CustomRefreshRequest(BaseModel):
    company_nos: List[str] = Field(default=["3", "4", "5", "6"])
    date_from: date = Field(..., description="Start date")
    date_to: date = Field(..., description="End date")
    include_master: bool = Field(default=False)
    include_invoices: bool = Field(default=True)
    include_deliveries: bool = Field(default=True)
    include_orders: bool = Field(default=False)
    include_receipts: bool = Field(default=False)
    include_gl_accounts: bool = Field(default=False)
    include_gl_transactions: bool = Field(default=False)
    rebuild_facts: bool = Field(default=True)
    rebuild_movement: bool = Field(default=True)
    rebuild_stock: bool = Field(default=False)
