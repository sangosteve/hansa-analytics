from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Hansa Analytics API"

    neon_database_url: Optional[str] = None
    database_url: Optional[str] = None

    hansa_base_url: Optional[str] = None
    hansa_username: Optional[str] = None
    hansa_password: Optional[str] = None
    hansa_company_no: str = "1"
    hansa_master_company_no: str = "1"

    # OAuth2 settings
    hansa_auth_mode: str = "basic"  # "oauth" | "basic"
    hansa_oauth_client_id: Optional[str] = None
    hansa_oauth_client_secret: Optional[str] = None
    hansa_oauth_redirect_uri: Optional[str] = None
    hansa_authorize_url: str = "https://standard-id.hansaworld.com/oauth-authorize"
    hansa_token_url: str = "https://standard-id.hansaworld.com/oauth-token"
    # 32-byte URL-safe base64 Fernet key; auto-derived from client_secret if absent
    hansa_oauth_encryption_key: Optional[str] = None

    # Frontend origin — used to redirect back to the SPA after OAuth callbacks.
    # Set to e.g. https://hansa-analytics.onrender.com (no trailing slash).
    # If unset, relative redirects are used (only works when backend == frontend origin).
    frontend_url: Optional[str] = None

    # Public API base URL — used in the OpenAPI `servers` field for connector imports.
    # Set to e.g. https://hansa-analytics-api.onrender.com (no trailing slash).
    api_url: str = "https://hansa-analytics-api.onrender.com"

    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4o"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    @property
    def db_url(self) -> str:
        url = self.neon_database_url or self.database_url
        if not url:
            raise ValueError(
                "No database URL configured. Set NEON_DATABASE_URL."
            )
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+psycopg://", 1)
        elif url.startswith("postgresql://") and "+psycopg" not in url:
            url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url


settings = Settings()
