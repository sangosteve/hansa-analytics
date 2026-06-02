---
name: Monorepo layout
description: Where frontend and backend code live, and how the Replit artifact system stays wired up after moving source out of artifacts/
---

## Rule
- `frontend/` — React Vite app (package name `@workspace/hansa-analytics`)
- `backend/` — Python FastAPI (uvicorn, port 8080)
- `artifacts/hansa-analytics/.replit-artifact/artifact.toml` — Replit artifact config ONLY; no source files in that dir
- `render.yaml` at repo root configures both Render services

## Why
User wanted a clean two-folder monorepo for independent Render deployment.
The Replit artifact system requires artifact.toml at `artifacts/<slug>/.replit-artifact/artifact.toml`
but the actual source can live anywhere — the dev command uses pnpm filter by package name.

## How to apply
- pnpm-workspace.yaml includes `frontend` explicitly (not covered by `artifacts/*` glob)
- artifact.toml publicDir = "frontend/dist/public"
- If adding new source files to the frontend, put them in `frontend/src/`
- tsconfig.json and vite.config.ts paths use single `../` (one level to workspace root, not two)
