---
name: Render deployment + Neon DB
description: The project is deployed on Render. Neon DB is the shared database between Replit dev and Render prod.
---

## Setup
- **Backend**: Hosted on Render (separate from Replit). Reads from Neon PostgreSQL via `NEON_DATABASE_URL`.
- **Frontend**: Also hosted on Render.
- **Neon DB**: Shared between Replit dev environment and Render prod. Running `run_refresh.py` here in Replit writes to the same Neon DB that Render reads.
- **Hansa URL**: Updated to point to the live server. Refresh pulls from live Hansa, writes to Neon.

## Refresh strategy
- Long-running refreshes (master data, invoices, deliveries) can exceed the bash tool's 2-minute timeout.
- **Best approach**: Use the `/api/refresh/full-background` endpoint (added to routes_refresh.py) which runs the full pipeline as a FastAPI BackgroundTask inside the uvicorn process. Returns immediately with a job token; poll `/api/refresh/status` for progress.
- Alternatively, trigger the Render deployment to run the refresh (if a Render cron/job is configured).

**Why:** Background processes launched via bash shell get killed when the shell exits. The uvicorn server (managed by Replit workflow) stays alive across bash invocations.
