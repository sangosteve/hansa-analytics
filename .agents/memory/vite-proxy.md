---
name: Vite proxy required
description: The frontend Vite dev server must proxy /api to the FastAPI backend or all API calls silently return HTML.
---

# Vite Proxy Configuration

## Rule
`frontend/vite.config.ts` must include a server proxy for `/api` pointing to `http://localhost:8080` (the FastAPI backend port). Without it, all API calls from the frontend hit the Vite dev server and get an HTML 404/200 page back, causing SyntaxError "Unexpected token '<'" at the JSON parse stage.

## Config
```ts
server: {
  proxy: {
    "/api": {
      target: "http://localhost:8080",
      changeOrigin: true,
    },
  },
}
```

**Why:** The Vite dev server runs on port 19517; the FastAPI backend runs on 8080. Without the proxy, relative `/api/...` fetch calls from React hit Vite (which returns its own HTML responses). The VITE_API_URL env var is the production override; in dev, the proxy is the fallback mechanism.

**How to apply:** Always check this if you see `SyntaxError: Unexpected token '<', "<!DOCTYPE"` in browser console — it means the API is returning HTML, not JSON.
