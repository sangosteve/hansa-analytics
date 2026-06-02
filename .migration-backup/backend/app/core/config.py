from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Hansa Analytics API"
    database_url: str

    hansa_base_url: str
    hansa_username: str
    hansa_password: str
    hansa_company_no: str = "1"
    hansa_master_company_no: str = "1"
    
    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-5"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


settings = Settings()