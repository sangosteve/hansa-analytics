"""
Hansa OAuth2 routes.

GET  /api/hansa/oauth/start         → initiate OAuth flow (returns auth_url)
GET  /api/hansa/oauth/callback      → OAuth callback from Hansa/StandardID
GET  /api/hansa/oauth/status        → connection status (no token values exposed)
GET  /api/hansa/oauth/config        → non-secret config (redirect URI, auth URL, etc.)
GET  /api/hansa/oauth/diagnostics   → verify OAuth config is complete (no secrets exposed)
POST /api/hansa/oauth/disconnect    → revoke/delete stored token
GET  /api/hansa/test-connection     → lightweight connection health check
"""

import logging
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.services import oauth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hansa", tags=["hansa-oauth"])


# ── Helpers ───────────────────────────────────────────────────────────────────

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


def _mask(value: str | None, show: int = 6) -> str:
    """Return a masked version of a secret for safe logging."""
    if not value:
        return "<not set>"
    if len(value) <= show:
        return "***"
    return value[:show] + "***"


# ── Config (safe, no secrets) ─────────────────────────────────────────────────

@router.get("/oauth/config")
def oauth_config():
    """
    Return non-secret OAuth configuration so the frontend can display the
    correct callback URL to register in the Hansa developer portal.
    """
    return {
        "auth_mode":     settings.hansa_auth_mode,
        "callback_url":  settings.hansa_oauth_redirect_uri or None,
        "authorize_url": settings.hansa_authorize_url,
    }


# ── Diagnostics (no secrets exposed) ─────────────────────────────────────────

@router.get("/oauth/diagnostics")
def oauth_diagnostics():
    """
    Confirm OAuth configuration completeness without exposing any secret values.
    Use this to verify the backend is ready to initiate an OAuth flow.
    """
    client_id      = settings.hansa_oauth_client_id
    client_secret  = settings.hansa_oauth_client_secret
    redirect_uri   = settings.hansa_oauth_redirect_uri
    authorize_url  = settings.hansa_authorize_url
    token_url      = settings.hansa_token_url
    frontend_url   = settings.frontend_url

    checks = {
        "client_id_set":      bool(client_id),
        "client_secret_set":  bool(client_secret),
        "redirect_uri_set":   bool(redirect_uri),
        "authorize_url_set":  bool(authorize_url),
        "token_url_set":      bool(token_url),
        "frontend_url_set":   bool(frontend_url),
        "auth_mode":          settings.hansa_auth_mode,
    }
    ready = all([
        checks["client_id_set"],
        checks["client_secret_set"],
        checks["redirect_uri_set"],
        checks["authorize_url_set"],
        checks["token_url_set"],
    ])

    # Build a sample auth URL (safe — uses masked client_id only)
    sample_url = None
    if client_id and redirect_uri and authorize_url:
        sample_params = {
            "client_id":     _mask(client_id),
            "redirect_uri":  redirect_uri,
            "response_type": "code",
            "type":          "offline",
            "state":         "<signed-state-token>",
        }
        sample_url = f"{authorize_url}?{urlencode(sample_params)}"

    return {
        "ready":            ready,
        "checks":           checks,
        "redirect_uri":     redirect_uri,
        "authorize_url":    authorize_url,
        "token_url":        token_url,
        "frontend_url":     frontend_url,
        "client_id_prefix": _mask(client_id),
        "sample_auth_url":  sample_url,
        "issues": [k for k, v in checks.items() if v is False],
    }


# ── Start OAuth flow ──────────────────────────────────────────────────────────

@router.get("/oauth/start")
def oauth_start(
    return_url: str = Query(default="/settings"),
    db: Session = Depends(get_db),
):
    """
    Initiate the OAuth flow. Browser navigates here and is immediately
    redirected to the Hansa/StandardID authorization page.

    StandardID requires:
      response_type=code
      type=offline
    """
    if not settings.hansa_oauth_client_id:
        logger.error("OAuth start failed: HANSA_OAUTH_CLIENT_ID is not configured")
        raise HTTPException(status_code=500, detail="HANSA_OAUTH_CLIENT_ID not configured")
    if not settings.hansa_oauth_redirect_uri:
        logger.error("OAuth start failed: HANSA_OAUTH_REDIRECT_URI is not configured")
        raise HTTPException(status_code=500, detail="HANSA_OAUTH_REDIRECT_URI not configured")
    if not settings.hansa_authorize_url:
        logger.error("OAuth start failed: HANSA_AUTHORIZE_URL is not configured")
        raise HTTPException(status_code=500, detail="HANSA_AUTHORIZE_URL not configured")

    state = oauth_service.make_oauth_state(return_url)

    # StandardID requires response_type=code AND type=offline
    params = {
        "client_id":     settings.hansa_oauth_client_id,
        "redirect_uri":  settings.hansa_oauth_redirect_uri,
        "response_type": "code",
        "type":          "offline",
        "state":         state,
    }
    auth_url = f"{settings.hansa_authorize_url}?{urlencode(params)}"

    logger.info(
        "OAuth flow started — authorize_url=%s redirect_uri=%s client_id=%s",
        settings.hansa_authorize_url,
        settings.hansa_oauth_redirect_uri,
        _mask(settings.hansa_oauth_client_id),
    )
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
    logger.info(
        "OAuth callback received — code=%s state=%s error=%s",
        bool(code), bool(state), error,
    )

    # Someone navigated here directly without going through the OAuth flow
    if not code and not error and not state:
        logger.warning("OAuth callback visited directly (no code/state/error). Redirecting to settings.")
        return RedirectResponse(
            url=f"{_frontend_settings_url()}?oauth_error=not_started",
            status_code=302,
        )

    # Hansa returned an error
    if error:
        logger.warning(
            "OAuth provider returned error: %s — %s",
            error, error_description or "(no description)",
        )
        dest = _frontend_settings_url(state)
        return RedirectResponse(
            url=f"{dest}?oauth_error={error}",
            status_code=302,
        )

    # Missing code or state — unexpected
    if not code:
        logger.warning("OAuth callback received state but no authorization code")
        return RedirectResponse(
            url=f"{_frontend_settings_url(state)}?oauth_error=missing_code",
            status_code=302,
        )

    if not state:
        logger.warning("OAuth callback received code but no state — possible CSRF")
        return RedirectResponse(
            url=f"{_frontend_settings_url()}?oauth_error=missing_state",
            status_code=302,
        )

    logger.info("Authorization code received — proceeding to token exchange")

    # Verify state (CSRF protection)
    try:
        return_url = oauth_service.verify_oauth_state(state)
    except ValueError as exc:
        logger.warning("OAuth state verification failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))

    # Exchange authorization code for tokens
    if not settings.hansa_oauth_client_id or not settings.hansa_oauth_client_secret:
        logger.error("Token exchange aborted: client credentials not configured")
        raise HTTPException(status_code=500, detail="OAuth client credentials not configured")

    logger.info(
        "Exchanging authorization code for tokens — token_url=%s redirect_uri=%s",
        settings.hansa_token_url,
        settings.hansa_oauth_redirect_uri,
    )

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
        logger.error(
            "Token exchange failed — HTTP %s: %s",
            exc.response.status_code,
            exc.response.text[:500],
        )
        raise HTTPException(
            status_code=502,
            detail=f"Token exchange failed: Hansa returned HTTP {exc.response.status_code}",
        )
    except httpx.ConnectError as exc:
        logger.error("Token exchange failed — could not connect to token URL: %s", exc)
        raise HTTPException(
            status_code=502,
            detail=f"Token exchange failed: could not connect to {settings.hansa_token_url}",
        )
    except Exception as exc:
        logger.error("Token exchange unexpected error: %s", exc)
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

    logger.info(
        "Hansa OAuth token stored successfully — token_type=%s scope=%s has_refresh=%s",
        token_data.get("token_type"),
        token_data.get("scope"),
        bool(token_data.get("refresh_token")),
    )

    # Redirect back to frontend settings page
    sep = "&" if "?" in return_url else "?"
    redirect_to = f"{return_url}{sep}oauth_connected=1"
    logger.info("OAuth complete — redirecting to %s", redirect_to)
    return RedirectResponse(url=redirect_to, status_code=302)


# ── Token refresh helper ──────────────────────────────────────────────────────

async def _refresh_access_token(db: Session, refresh_token: str) -> bool:
    """Attempt to refresh the access token. Returns True on success."""
    if not settings.hansa_oauth_client_id or not settings.hansa_oauth_client_secret:
        logger.warning("Token refresh skipped: client credentials not configured")
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
        logger.info("Token refreshed successfully")
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
    logger.info("OAuth token %s", "deleted" if deleted else "was already absent")
    return {
        "status":  "disconnected" if deleted else "already_disconnected",
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
                        "message": "Token expired and no refresh token available. Reconnect Hansa.",
                    },
                )

        access_token = token["access_token"]
        auth_header = f"Bearer {access_token}"
    else:
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
                    "message": "Hansa rejected the credentials (HTTP 401) — token may be invalid or expired",
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
                "message": f"Could not connect to {settings.hansa_base_url} — check HANSA_BASE_URL",
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
