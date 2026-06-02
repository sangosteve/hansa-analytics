# Hansa Analytics Dashboard

A sales analytics dashboard for comparing company sales data, with AI-powered insights panel.

## Run & Operate

- `pnpm --filter @workspace/hansa-analytics run dev` — run the frontend (port auto-assigned by workflow)
- `pnpm run typecheck` — full typecheck across all packages
- Required env: `VITE_API_URL` — URL to the Python FastAPI backend (default: `http://127.0.0.1:8000/api`)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (artifact: `hansa-analytics`)
- Charts: Apache ECharts via `echarts-for-react`
- Styling: Tailwind CSS v4, shadcn/ui components
- Font: Figtree (Google Fonts)

## Where things live

- `artifacts/hansa-analytics/` — the Vite + React frontend app
- `artifacts/hansa-analytics/src/pages/home.tsx` — main dashboard page (sales charts + filters)
- `artifacts/hansa-analytics/src/components/ai/ai-insights-panel.tsx` — AI insights chat panel
- `artifacts/hansa-analytics/src/lib/api.ts` — typed API client (connects to Python FastAPI backend)
- `.migration-backup/frontend/` — original Next.js source (reference only)
- `.migration-backup/backend/` — original Python FastAPI backend (needs separate hosting)

## Architecture decisions

- Frontend-only Replit artifact: the Python FastAPI backend is not ported (it uses Alembic, SQLAlchemy, and a separate DB). The frontend calls `VITE_API_URL` to reach it.
- All `process.env.NEXT_PUBLIC_*` → `import.meta.env.VITE_*` pattern applied throughout.
- `next/font/google` (Figtree) replaced with a standard Google Fonts `<link>` tag in `index.html`.
- Scaffold shadcn UI components kept (button, card, input, select) — compatible with original app's component API.

## Product

- Sales dashboard: filter by company and date range, view monthly/cumulative/growth charts and rep contribution pie chart.
- AI Sales Insights: chat panel for natural language queries about sales tonnage, customers, and buying patterns.

## Gotchas

- The Python backend must be run separately and configured via `VITE_API_URL`. Without it, the frontend shows "Unable to load sales summary" errors (expected behavior).
- The backend lives in `.migration-backup/backend/` — it uses FastAPI + PostgreSQL + Alembic.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
