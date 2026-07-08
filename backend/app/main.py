import json
import os
from contextlib import asynccontextmanager

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from app.api.routes_ai import router as ai_router
from app.api.routes_targets import router as targets_router
from app.api.routes_oauth import router as oauth_router
from app.api.routes_analytics import router as analytics_router
from app.api.routes_customer_movement import router as customer_movement_router
from app.api.routes_hansa import router as hansa_router
from app.api.routes_movement import router as movement_router
from app.api.routes_refresh import router as refresh_router
from app.api.routes_sales_summary import router as sales_summary_router
from app.api.routes_stock import router as stock_router
from app.core.config import settings
from app.services.scheduler_service import start_scheduler, stop_scheduler

OPENAPI_TAGS = [
    {
        "name": "AI Insights",
        "description": "Ask natural-language questions about sales data and receive AI-generated analysis, charts, and tables.",
    },
    {
        "name": "Analytics",
        "description": "Predictive analytics, customer purchase history, item sales trends, and daily sales totals.",
    },
    {
        "name": "Sales Summary",
        "description": "Aggregated monthly sales figures, representative contributions, and division breakdowns.",
    },
    {
        "name": "Movement Analytics",
        "description": "Product group and customer movement status — growing, stable, at-risk, or dead stock.",
    },
    {
        "name": "Customer Movement",
        "description": "Customer-level movement data with status and action-band filters.",
    },
    {
        "name": "Stock",
        "description": "Current stock levels, orders outstanding, and shipment status.",
    },
    {
        "name": "Targets",
        "description": "Sales targets — create, read, update, and delete targets by company, year, and month.",
    },
    {
        "name": "Refresh",
        "description": "Trigger and monitor background data-sync jobs from Hansa ERP.",
    },
    {
        "name": "Hansa",
        "description": "Debug and diagnostic endpoints for Hansa ERP connectivity.",
    },
    {
        "name": "Hansa OAuth",
        "description": "OAuth2 flow for Hansa ERP authentication.",
    },
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description=(
        "REST API for the Hansa Analytics dashboard. "
        "Provides sales summaries, movement analytics, predictive insights, "
        "stock levels, and AI-powered natural-language queries over HansaWorld/Standard ERP data."
    ),
    servers=[
        {
            "url": settings.api_url,
            "description": "Production (Render)",
        },
        {
            "url": "http://localhost:8080",
            "description": "Local development",
        },
    ],
    openapi_tags=OPENAPI_TAGS,
    lifespan=lifespan,
)

_raw_origins = os.environ.get("ALLOWED_ORIGINS", "*")
_allowed_origins: list[str] = (
    ["*"] if _raw_origins.strip() == "*"
    else [o.strip() for o in _raw_origins.split(",") if o.strip()]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(hansa_router)
app.include_router(oauth_router)
app.include_router(refresh_router)
app.include_router(analytics_router)
app.include_router(sales_summary_router)
app.include_router(customer_movement_router)
app.include_router(movement_router)
app.include_router(stock_router)
app.include_router(ai_router)
app.include_router(targets_router)


@app.get("/")
def root():
    return {"message": "Hansa Analytics API is running"}


@app.get("/api/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/openapi.yaml", include_in_schema=False)
def openapi_yaml():
    """Return the OpenAPI schema as YAML — useful for Copilot connectors."""
    schema = app.openapi()
    return PlainTextResponse(
        yaml.safe_dump(json.loads(json.dumps(schema)), allow_unicode=True, sort_keys=False),
        media_type="application/yaml",
    )
