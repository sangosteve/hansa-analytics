# Hansa Analytics

A professional analytics dashboard and AI-driven insight platform for HansaWorld/Standard ERP data. Provides sales summaries, customer movement tracking, stock status monitoring, and predictive analytics powered by an AI assistant.

## Run & Operate

- `API Server` workflow — Python FastAPI backend on port 8080 (uvicorn, auto-reload)
- `Hansa Analytics` workflow — React/Vite frontend on port 19517 (mapped to port 80 in preview)
- `cd backend && python -m alembic upgrade head` — apply database migrations
- `cd backend && python run_refresh.py` — trigger Hansa ERP data sync

## Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI, TanStack Query, ECharts, Wouter
- **Backend**: Python 3.11, FastAPI, SQLAlchemy, Alembic, Pydantic, Uvicorn
- **AI**: OpenAI SDK (GPT-4o) for AI insights
- **Database**: Neon PostgreSQL (via `NEON_DATABASE_URL`)
- **Monorepo**: pnpm workspaces

## Where things live

- `backend/app/` — FastAPI application (routes, services, models)
- `backend/alembic/versions/` — database migration files
- `artifacts/hansa-analytics/src/` — React frontend source
- `lib/api-spec/` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/` — generated React Query hooks (from codegen)

## Architecture decisions

- FastAPI backend handles all data logic and ERP sync; frontend is a pure React SPA
- Database URL checked as `NEON_DATABASE_URL` first, then `DATABASE_URL` fallback (see `backend/app/core/config.py`)
- Alembic migrations manage schema — run `alembic upgrade head` after any schema changes
- OpenAI used server-side only for AI insights (never exposed to browser)

## Product

Sales analytics, customer movement (at-risk/stopped/declining), stock management, dead stock identification, and a natural-language AI insights panel backed by GPT-4o.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The frontend dev server runs on port 19517 (not 5000) — mapped to port 80 for the preview pane
- Database tables are populated via Hansa ERP sync (`run_refresh.py`) — a fresh DB will show empty data until synced
- Python deps are installed to `.pythonlibs/` — run `pip install -r backend/requirements.txt` if packages are missing after environment resets

## Pointers

- DB connection: `NEON_DATABASE_URL` secret (Neon connection string)
- AI: `OPENAI_API_KEY` secret (optional — AI insights panel requires it)
