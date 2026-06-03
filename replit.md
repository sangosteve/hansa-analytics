# Hansa Analytics

A professional analytics dashboard and AI-driven insight platform for HansaWorld/Standard ERP data. Provides sales summaries, customer movement tracking, stock status monitoring, and predictive analytics powered by an AI assistant.

## Project Structure

```
/
├── backend/        FastAPI Python API (port 8080 in dev)
│   ├── app/        Routes, services, models, core config
│   ├── alembic/    Database migrations
│   ├── requirements.txt
│   ├── run_refresh.py   Hansa ERP data sync script
│   └── .env.example
├── frontend/       React + Vite SPA
│   ├── src/        Pages, components, lib (api client)
│   ├── package.json     Standalone — no workspace catalog refs
│   ├── vite.config.ts
│   └── .env.example
├── render.yaml     Render deployment config (both services)
└── replit.md       This file
```

## Run & Operate (Replit dev environment)

- `API Server` workflow — Python FastAPI backend on port 8080 (uvicorn, auto-reload)
- `Hansa Analytics` workflow — React/Vite frontend on port 19517 (mapped to port 80 in preview)
- `cd backend && python -m alembic upgrade head` — apply database migrations
- `cd backend && python run_refresh.py` — trigger Hansa ERP data sync

## Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI, TanStack Query, ECharts, Wouter
- **Backend**: Python 3.11, FastAPI, SQLAlchemy, Alembic, Pydantic, Uvicorn
- **AI**: OpenAI SDK (GPT-4o) for AI insights
- **Database**: Neon PostgreSQL (via `NEON_DATABASE_URL`)
- **Monorepo**: pnpm workspaces (dev only — each service deploys independently)

## Architecture decisions

- FastAPI backend handles all data logic and ERP sync; frontend is a pure React SPA
- Frontend calls backend via `VITE_API_URL` env var (falls back to `/api` in dev via Vite proxy or same-host routing)
- Database URL checked as `NEON_DATABASE_URL` first, then `DATABASE_URL` fallback (see `backend/app/core/config.py`)
- Alembic migrations manage schema — run `alembic upgrade head` after any schema changes
- OpenAI used server-side only for AI insights (never exposed to browser)
- CORS controlled by `ALLOWED_ORIGINS` env var on the backend (`*` by default; set to frontend URL in production)

## Deploying to Render

See `render.yaml` for the full config. Both services are defined there. Key settings:

### Backend (Web Service)
- **Root directory**: `backend`
- **Build**: `pip install -r requirements.txt`
- **Start**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Env vars**: `NEON_DATABASE_URL`, `HANSA_*`, `OPENAI_API_KEY`, `ALLOWED_ORIGINS`

### Frontend (Static Site)
- **Root directory**: `frontend`
- **Build**: `npm install && npm run build`
- **Publish directory**: `dist`
- **Env vars**: `VITE_API_URL` → your backend's Render URL + `/api`

## Secrets & environment variables

| Variable | Service | Purpose |
|---|---|---|
| `NEON_DATABASE_URL` | Backend | PostgreSQL connection string |
| `HANSA_BASE_URL` | Backend | Hansa ERP server URL |
| `HANSA_USERNAME` | Backend | Hansa ERP credentials |
| `HANSA_PASSWORD` | Backend | Hansa ERP credentials |
| `HANSA_COMPANY_NO` | Backend | Transaction company number |
| `HANSA_MASTER_COMPANY_NO` | Backend | Items/customers company number |
| `OPENAI_API_KEY` | Backend | AI insights (optional) |
| `ALLOWED_ORIGINS` | Backend | Comma-separated frontend origins (default `*`) |
| `VITE_API_URL` | Frontend | Backend API base URL (e.g. `https://api.example.com/api`) |

## Gotchas

- The frontend dev server runs on port 19517 (not 5000) — mapped to port 80 for the preview pane
- Database tables are populated via Hansa ERP sync (`run_refresh.py`) — a fresh DB will show empty data until synced
- Python deps are installed to `.pythonlibs/` — run `pip install -r backend/requirements.txt` if packages are missing after environment resets
- `frontend/package.json` has explicit version numbers (no `catalog:` refs) so Render can install deps without the pnpm workspace

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._
