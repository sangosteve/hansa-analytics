"""
Hansa OAuth2 routes.

GET  /api/hansa/oauth/start         → initiate OAuth flow (returns auth_url)
GET  /api/hansa/oauth/callback      → OAuth callback from Hansa/StandardID
GET  /api/hansa/oauth/status        → connection status (no token values exposed)
POST /api/hansa/oauth/disconnect    → revoke/delete stored token
GET  /api/hansa/test-connection     → lightweight connection health check
"""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.services import oauth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hansa", tags=["hansa-oauth"])


def _frontend_settings_url(state: str | None = None) -> str:
    """
    Resolve the frontend /settings URL for post-OAuth redirects.

    Priority:
      1. return_url embedded in the HMAC-signed state parameter (most accurate —
         carries exactly the page the user started from).
      2. FRONTEND_URL env var + "/settings" (reliable fallback for error paths
         where state may be absent or malformed).
      3. Relative "/settings" (last resort — only correct when backend and
         frontend share the same origin, which is never true on Render).
    """
    if state:
        try:
            return oauth_service.verify_oauth_state(state)
        except Exception:
            pass
    if settings.frontend_url:
        return settings.frontend_url.rstrip("/") + "/settings"
    return "/settings"


# ── Config (safe, no secrets) ─────────────────────────────────────────────────

@router.get("/oauth/config")
def oauth_config():
    """
    Return non-secret OAuth configuration so the frontend can display the
    correct callback URL to register in the Hansa developer portal.
    """
    return {
        "auth_mode": settings.hansa_auth_mode,
        "callback_url": settings.hansa_oauth_redirect_uri or None,
        "authorize_url": settings.hansa_authorize_url,
    }


# ── Start OAuth flow ──────────────────────────────────────────────────────────

@router.get("/oauth/start")
def oauth_start(
    return_url: str = Query(default="/settings"),
    db: Session = Depends(get_db),
):
    """
    Initiate the OAuth flow.  Browser navigates here and is immediately
    redirected to the Hansa/StandardID authorization page.
    """
    if not settings.hansa_oauth_client_id:
        raise HTTPException(status_code=500, detail="HANSA_OAUTH_CLIENT_ID not configured")
    if not settings.hansa_oauth_redirect_uri:
        raise HTTPException(status_code=500, detail="HANSA_OAUTH_REDIRECT_URI not configured")
    if not settings.hansa_authorize_url:
        raise HTTPException(status_code=500, detail="HANSA_AUTHORIZE_URL not configured")

    state = oauth_service.make_oauth_state(return_url)

    from urllib.parse import urlencode
    params = {
        "response_type": "code",
        "client_id":     settings.hansa_oauth_client_id,
        "redirect_uri":  settings.hansa_oauth_redirect_uri,
        "state":         state,
    }
    auth_url = f"{settings.hansa_authorize_url}?{urlencode(params)}"

    logger.info("Starting OAuth flow → %s", settings.hansa_authorize_url)
    return RedirectResponse(url=auth_url, status_code=302)


# ── OAuth callback ────────────────────────────────────────────────────────────

@router.get("/oauth/callback")
async def oauth_callback(
    code: str = Query(default=None),
    state: str = Query(default=None),
    error: str = Query(default=None),
    error_description: str = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    Callback endpoint registered in MyStandard Developer Credentials.
    Must match HANSA_OAUTH_REDIRECT_URI exactly.
    Exchanges the authorization code for tokens and redirects to the frontend.
    """
    # Someone navigated here directly without going through the OAuth flow
    if not code and not error and not state:
        logger.warning("OAuth callback visited directly (no code/state). Redirecting to settings.")
        return RedirectResponse(
            url=f"{_frontend_settings_url()}?oauth_error=not_started",
            status_code=302,
        )

    # Hansa returned an error
    if error:
        logger.warning("OAuth error from Hansa: %s — %s", error, error_description)
        # Use state to recover the return_url so we redirect to the frontend, not the API server
        dest = _frontend_settings_url(state)
        return RedirectResponse(
            url=f"{dest}?oauth_error={error}",
            status_code=302,
        )

    # Missing code but no error — unexpected
    if not code or not state:
        logger.warning("OAuth callback missing code or state (code=%s state=%s)", bool(code), bool(state))
        return RedirectResponse(
            url=f"{_frontend_settings_url(state)}?oauth_error=missing_code",
            status_code=302,
        )

    # Verify state (CSRF protection)
    try:
        return_url = oauth_service.verify_oauth_state(state)
    except ValueError as exc:
        logger.warning("OAuth state verification failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))

    # Exchange authorization code for tokens
    if not settings.hansa_oauth_client_id or not settings.hansa_oauth_client_secret:
        raise HTTPException(status_code=500, detail="OAuth client credentials not configured")

    token_payload = {
        "grant_type":    "authorization_code",
        "code":          code,
        "redirect_uri":  settings.hansa_oauth_redirect_uri,
        "client_id":     settings.hansa_oauth_client_id,
        "client_secret": settings.hansa_oauth_client_secret,
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                settings.hansa_token_url,
                data=token_payload,
                headers={"Accept": "application/json"},
            )
        resp.raise_for_status()
        token_data = resp.json()
    except httpx.HTTPStatusError as exc:
        logger.error("Token exchange failed — HTTP %s: %s", exc.response.status_code, exc.response.text[:500])
        raise HTTPException(status_code=502, detail=f"Token exchange failed: HTTP {exc.response.status_code}")
    except Exception as exc:
        logger.error("Token exchange error: %s", exc)
        raise HTTPException(status_code=502, detail="Token exchange error — check server logs")

    # Store tokens securely
    oauth_service.store_token(
        db,
        access_token=token_data.get("access_token", ""),
        token_type=token_data.get("token_type", "Bearer"),
        expires_in=token_data.get("expires_in"),
        refresh_token=token_data.get("refresh_token"),
        scope=token_data.get("scope"),
    )

    logger.info("Hansa OAuth token stored successfully")

    # Redirect back to frontend settings page
    sep = "&" if "?" in return_url else "?"
    redirect_to = f"{return_url}{sep}oauth_connected=1"
    return RedirectResponse(url=redirect_to, status_code=302)


# ── Token refresh helper ──────────────────────────────────────────────────────

async def _refresh_access_token(db: Session, refresh_token: str) -> bool:
    """Attempt to refresh the access token. Returns True on success."""
    if not settings.hansa_oauth_client_id or not settings.hansa_oauth_client_secret:
        return False
    payload = {
        "grant_type":    "refresh_token",
        "refresh_token": refresh_token,
        "client_id":     settings.hansa_oauth_client_id,
        "client_secret": settings.hansa_oauth_client_secret,
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                settings.hansa_token_url,
                data=payload,
                headers={"Accept": "application/json"},
            )
        resp.raise_for_status()
        token_data = resp.json()
        oauth_service.store_token(
            db,
            access_token=token_data.get("access_token", ""),
            token_type=token_data.get("token_type", "Bearer"),
            expires_in=token_data.get("expires_in"),
            refresh_token=token_data.get("refresh_token", refresh_token),
            scope=token_data.get("scope"),
        )
        return True
    except Exception as exc:
        logger.warning("Token refresh failed: %s", exc)
        return False


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/oauth/status")
def oauth_status(db: Session = Depends(get_db)):
    """Return connection status (no token values are ever exposed)."""
    return oauth_service.get_connection_status(db)


# ── Disconnect ────────────────────────────────────────────────────────────────

@router.post("/oauth/disconnect")
def oauth_disconnect(db: Session = Depends(get_db)):
    """Delete stored tokens — forces reconnection."""
    deleted = oauth_service.delete_token(db)
    return {
        "status": "disconnected" if deleted else "already_disconnected",
        "message": "Hansa OAuth tokens cleared" if deleted else "No token was stored",
    }


# ── Test connection ───────────────────────────────────────────────────────────

@router.get("/test-connection")
async def test_connection(db: Session = Depends(get_db)):
    """
    Lightweight connection health check.
    Does NOT fetch invoices, deliveries, orders, or any large data.
    Verifies token + Hansa server reachability only.
    """
    auth_mode = settings.hansa_auth_mode

    if auth_mode == "oauth":
        token = oauth_service.get_token(db)
        if token is None:
            return JSONResponse(
                status_code=200,
                content={
                    "ok": False,
                    "auth_mode": "oauth",
                    "status": "not_connected",
                    "message": "No OAuth token stored. Use Connect Hansa to authenticate.",
                },
            )

        if oauth_service.is_token_expired(token):
            # Try refresh
            if token.get("refresh_token"):
                refreshed = await _refresh_access_token(db, token["refresh_token"])
                if not refreshed:
                    return JSONResponse(
                        status_code=200,
                        content={
                            "ok": False,
                            "auth_mode": "oauth",
                            "status": "expired",
                            "message": "Token expired and refresh failed. Reconnect Hansa.",
                        },
                    )
                token = oauth_service.get_token(db)
            else:
                return JSONResponse(
                    status_code=200,
                    content={
                        "ok": False,
                        "auth_mode": "oauth",
                        "status": "expired",
                        "message": "Token expired. Reconnect Hansa.",
                    },
                )

        access_token = token["access_token"]
        auth_header = f"Bearer {access_token}"
    else:
        # Basic auth
        if not settings.hansa_username or not settings.hansa_password:
            return JSONResponse(
                status_code=200,
                content={
                    "ok": False,
                    "auth_mode": "basic",
                    "status": "not_configured",
                    "message": "HANSA_USERNAME / HANSA_PASSWORD not set",
                },
            )
        import base64 as _b64
        creds = _b64.b64encode(
            f"{settings.hansa_username}:{settings.hansa_password}".encode()
        ).decode()
        auth_header = f"Basic {creds}"

    # Ping Hansa — fetch a tiny safe endpoint (item groups, limit=1)
    if not settings.hansa_base_url:
        return JSONResponse(
            status_code=200,
            content={
                "ok": False,
                "auth_mode": auth_mode,
                "status": "not_configured",
                "message": "HANSA_BASE_URL not set",
            },
        )

    test_url = (
        f"{settings.hansa_base_url.rstrip('/')}"
        f"/api/{settings.hansa_master_company_no}/ITVc?limit=1&fields=Code"
    )

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                test_url,
                headers={"Authorization": auth_header, "Accept": "application/json"},
            )

        if resp.status_code == 401:
            return JSONResponse(
                status_code=200,
                content={
                    "ok": False,
                    "auth_mode": auth_mode,
                    "status": "unauthorized",
                    "message": "Hansa rejected the credentials (HTTP 401)",
                },
            )

        resp.raise_for_status()
        return {
            "ok": True,
            "auth_mode": auth_mode,
            "status": "connected",
            "http_status": resp.status_code,
            "message": "Hansa server is reachable and credentials are valid",
        }

    except httpx.ConnectError:
        return JSONResponse(
            status_code=200,
            content={
                "ok": False,
                "auth_mode": auth_mode,
                "status": "unreachable",
                "message": f"Could not connect to {settings.hansa_base_url}",
            },
        )
    except Exception as exc:
        return JSONResponse(
            status_code=200,
            content={
                "ok": False,
                "auth_mode": auth_mode,
                "status": "error",
                "message": str(exc)[:200],
            },
        )
