from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_ai import router as ai_router
from app.api.routes_customer_movement import router as customer_movement_router
from app.api.routes_hansa import router as hansa_router
from app.api.routes_movement import router as movement_router
from app.api.routes_refresh import router as refresh_router
from app.api.routes_sales_summary import router as sales_summary_router
from app.core.config import settings

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(hansa_router)
app.include_router(refresh_router)
app.include_router(sales_summary_router)
app.include_router(customer_movement_router)
app.include_router(movement_router)
app.include_router(ai_router)


@app.get("/")
def root():
    return {"message": "Hansa Analytics API is running"}


@app.get("/api/healthz")
def healthz():
    return {"status": "ok"}
