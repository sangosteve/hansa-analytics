import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
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
