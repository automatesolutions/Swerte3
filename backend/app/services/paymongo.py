"""PayMongo webhook verification (sketch)."""
from __future__ import annotations

import hashlib
import hmac
from typing import Any, Dict

from app.config import get_settings


def verify_paymongo_signature(payload_body: bytes, signature_header: str | None) -> bool:
    if not get_settings().paymongo_webhook_secret:
        return True
    if not signature_header:
        return False
    secret = get_settings().paymongo_webhook_secret
    digest = hmac.new(secret.encode(), payload_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, signature_header.strip())
