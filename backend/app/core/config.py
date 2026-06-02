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
