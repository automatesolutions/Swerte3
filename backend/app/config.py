"""Application settings."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Always load backend/.env regardless of current working directory (uvicorn may start elsewhere).
_BACKEND_ENV = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_BACKEND_ENV),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql://swerte3:swerte3@localhost:5432/swerte3"
    secret_key: str = "dev-secret-change-in-production"
    debug: bool = False
    # When DEBUG=true or OTP_TEST_MODE=true, use this exact 6-digit code instead of random (testing only).
    otp_test_code: str = ""
    otp_test_mode: bool = False
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

    # Daily "Litrato" puzzle (OpenAI Images). Cheapest: dall-e-2 @ 256x256 (~$0.016/image).
    openai_image_api_key: str = ""
    openai_image_base_url: str = "https://api.openai.com/v1"
    openai_image_model: str = "dall-e-2"
    openai_image_size: str = "256x256"

    sms_provider: str = "console"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    # Semaphore — Philippines SMS (https://www.semaphore.co/)
    semaphore_api_key: str = ""
    semaphore_sender_name: str = ""

    # paymongo = PayMongo hosted checkout (good for PH testing). paypal = PayPal Orders + capture.
    payment_provider: str = "paymongo"

    # PayPal (Orders v2). Get Client ID + Secret from developer.paypal.com → Apps & Credentials.
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_sandbox: bool = True
    # HTTPS URLs PayPal redirects to after approve / cancel (must match app URL in production).
    paypal_return_url: str = "https://example.com/paypal-return"
    paypal_cancel_url: str = "https://example.com/paypal-cancel"
    paypal_currency: str = "PHP"

    paymongo_secret_key: str = ""
    paymongo_public_key: str = ""
    paymongo_webhook_secret: str = ""
    paymongo_checkout_success_url: str = ""
    paymongo_checkout_cancel_url: str = ""
    paymongo_skip_capabilities: bool = True

    ga4_measurement_id: str = ""

    # Protect /ingest and similar (optional)
    admin_api_key: str = ""

    premium_credits_per_payment: int = 1

    @field_validator("payment_provider", mode="before")
    @classmethod
    def _normalize_payment_provider(cls, v: Any) -> str:
        if v is None or str(v).strip() == "":
            return "paymongo"
        s = str(v).strip().lower()
        return s if s in ("paymongo", "paypal") else "paymongo"

    @field_validator("paypal_client_id", "paypal_client_secret", mode="before")
    @classmethod
    def _normalize_paypal_secrets(cls, v: Any) -> str:
        """Strip whitespace and optional surrounding quotes from .env (common copy-paste mistake)."""
        if v is None:
            return ""
        s = str(v).strip()
        if len(s) >= 2 and s[0] == s[-1] and s[0] in ('"', "'"):
            s = s[1:-1].strip()
        return s

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
