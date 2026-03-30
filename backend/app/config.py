"""Application settings."""
from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql://swerte3:swerte3@localhost:5432/swerte3"
    secret_key: str = "dev-secret-change-in-production"
    debug: bool = False
    api_cors_origins: str = "*"

    google_sheet_id: str = "12mVATo7sJTVbvlwEMcOYQwBy8t9LOtGeFlhwaxywCJU"
    sheet_tab_9am: str = "9AM"
    sheet_tab_4pm: str = "4PM"
    sheet_tab_9pm: str = "9PM"
    sheet_col_date: str = "Date"
    sheet_col_result: str = "Result"

    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 14

    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model_name: str = "gpt-4o-mini"

    sms_provider: str = "console"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""

    paymongo_secret_key: str = ""
    paymongo_webhook_secret: str = ""

    ga4_measurement_id: str = ""

    # Protect /ingest and similar (optional)
    admin_api_key: str = ""

    premium_grant_days_per_payment: int = 30

    @property
    def cors_origins_list(self) -> List[str]:
        raw = self.api_cors_origins.strip()
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


# Swertres domain: three digits 0-9 per position (repeats allowed)
SWERTRES_DIGIT_MIN = 0
SWERTRES_DIGIT_MAX = 9
SWERTRES_LEN = 3

XGBOOST_PARAMS = {
    "n_estimators": 80,
    "max_depth": 4,
    "learning_rate": 0.08,
    "subsample": 0.85,
    "random_state": 42,
}
