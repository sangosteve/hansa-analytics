"""
Hansa OAuth2 token management service.

Handles:
- Fernet-based token encryption / decryption
- HMAC-signed state parameter (CSRF protection, no DB storage needed)
- Token CRUD in hansa_oauth_tokens table
- Token retrieval with expiry awareness
"""

import base64
import hashlib
import hmac
import json
import time
from datetime import datetime, timezone
from typing import Optional

from cryptography.fernet import Fernet
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import HansaOAuthToken


# ── Fernet key derivation ─────────────────────────────────────────────────────

def _get_fernet() -> Fernet:
    """Return a Fernet instance. Key comes from env or is derived from client secret."""
    if settings.hansa_oauth_encryption_key:
        key = settings.hansa_oauth_encryption_key.encode()
    else:
        # Derive a 32-byte key from client_secret using SHA-256 then base64-encode it
        secret = (settings.hansa_oauth_client_secret or "hansa-fallback-key").encode()
        raw = hashlib.sha256(secret).digest()
        key = base64.urlsafe_b64encode(raw)
    return Fernet(key)


def _encrypt(value: str) -> str:
    return _get_fernet().encrypt(value.encode()).decode()


def _decrypt(value: str) -> str:
    return _get_fernet().decrypt(value.encode()).decode()


# ── HMAC-signed state parameter ───────────────────────────────────────────────

def make_oauth_state(return_url: str) -> str:
    """Create a tamper-proof state string embedding the return URL."""
    secret = (settings.hansa_oauth_client_secret or "hansa-state-secret").encode()
    payload = json.dumps({"return_url": return_url, "ts": time.time()})
    sig = hmac.new(secret, payload.encode(), hashlib.sha256).hexdigest()
    combined = f"{payload}|||{sig}"
    return base64.urlsafe_b64encode(combined.encode()).decode()


def verify_oauth_state(state: str, max_age_seconds: int = 600) -> str:
    """Verify and extract the return URL from a state string.
    Raises ValueError on invalid or expired state."""
    try:
        decoded = base64.urlsafe_b64decode(state.encode()).decode()
        payload_str, sig = decoded.rsplit("|||", 1)
    except Exception:
        raise ValueError("Malformed OAuth state")

    secret = (settings.hansa_oauth_client_secret or "hansa-state-secret").encode()
    expected = hmac.new(secret, payload_str.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise ValueError("OAuth state signature invalid — possible CSRF")

    try:
        payload = json.loads(payload_str)
    except Exception:
        raise ValueError("OAuth state payload unreadable")

    if time.time() - payload.get("ts", 0) > max_age_seconds:
        raise ValueError("OAuth state expired — please retry the connection")

    return payload.get("return_url", "/settings")


# ── Token CRUD ────────────────────────────────────────────────────────────────

PROVIDER = "hansa"


def store_token(
    db: Session,
    access_token: str,
    token_type: str = "Bearer",
    expires_in: Optional[int] = None,
    refresh_token: Optional[str] = None,
    scope: Optional[str] = None,
) -> HansaOAuthToken:
    """Upsert the Hansa OAuth token (single row per provider)."""
    expires_at: Optional[datetime] = None
    if expires_in:
        expires_at = datetime.fromtimestamp(
            time.time() + expires_in, tz=timezone.utc
        )

    row = db.query(HansaOAuthToken).filter_by(provider=PROVIDER).first()
    if row is None:
        row = HansaOAuthToken(provider=PROVIDER)
        db.add(row)

    row.access_token_enc  = _encrypt(access_token)
    row.refresh_token_enc = _encrypt(refresh_token) if refresh_token else None
    row.token_type        = token_type
    row.expires_at        = expires_at
    row.scope             = scope
    row.updated_at        = datetime.now(tz=timezone.utc)

    db.commit()
    db.refresh(row)
    return row


def get_token(db: Session) -> Optional[dict]:
    """Return decrypted token info or None if not connected."""
    row = db.query(HansaOAuthToken).filter_by(provider=PROVIDER).first()
    if row is None:
        return None

    try:
        access_token = _decrypt(row.access_token_enc)
    except Exception:
        return None

    refresh_token = None
    if row.refresh_token_enc:
        try:
            refresh_token = _decrypt(row.refresh_token_enc)
        except Exception:
            pass

    return {
        "access_token":  access_token,
        "refresh_token": refresh_token,
        "token_type":    row.token_type or "Bearer",
        "expires_at":    row.expires_at,
        "scope":         row.scope,
        "updated_at":    row.updated_at,
        "created_at":    row.created_at,
    }


def is_token_expired(token: dict) -> bool:
    """Return True if the token is expired (with 60-second buffer)."""
    exp = token.get("expires_at")
    if exp is None:
        return False
    now = datetime.now(tz=timezone.utc)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return now >= (exp.__class__(exp.year, exp.month, exp.day,
                                 exp.hour, exp.minute, exp.second - 60,
                                 tzinfo=exp.tzinfo)
                   if exp.second >= 60
                   else exp)


def delete_token(db: Session) -> bool:
    """Delete the stored token; returns True if one was deleted."""
    row = db.query(HansaOAuthToken).filter_by(provider=PROVIDER).first()
    if row:
        db.delete(row)
        db.commit()
        return True
    return False


def get_connection_status(db: Session) -> dict:
    """Return a safe status payload (no tokens exposed)."""
    row = db.query(HansaOAuthToken).filter_by(provider=PROVIDER).first()
    if row is None:
        return {
            "connected":   False,
            "status":      "not_connected",
            "auth_mode":   settings.hansa_auth_mode,
        }

    token = get_token(db)
    if token is None:
        return {
            "connected":   False,
            "status":      "error",
            "auth_mode":   settings.hansa_auth_mode,
            "message":     "Token stored but could not be decrypted",
        }

    expired = is_token_expired(token)
    return {
        "connected":      not expired,
        "status":         "expired" if expired else "connected",
        "auth_mode":      settings.hansa_auth_mode,
        "token_type":     token["token_type"],
        "scope":          token["scope"],
        "expires_at":     token["expires_at"].isoformat() if token["expires_at"] else None,
        "last_connected": token["updated_at"].isoformat() if token["updated_at"] else None,
        "has_refresh":    token["refresh_token"] is not None,
    }
