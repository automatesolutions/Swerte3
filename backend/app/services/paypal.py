"""PayPal REST API v2 (Orders) for Swerte3 top-up."""
from __future__ import annotations

import base64
import json
import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)


class PayPalClientError(Exception):
    def __init__(self, status_code: int, payload: Any):
        self.status_code = status_code
        self.payload = payload
        super().__init__(str(payload))


def describe_paypal_error(payload: Any) -> str:
    """Turn PayPal / OAuth JSON into a short string for API responses and logs."""
    if payload is None:
        return "Unknown PayPal error"
    if not isinstance(payload, dict):
        return str(payload)[:600]
    parts: list[str] = []
    name = payload.get("name")
    if isinstance(name, str) and name.strip():
        parts.append(name.strip())
    msg = payload.get("message")
    if isinstance(msg, str) and msg.strip():
        parts.append(msg.strip())
    err = payload.get("error")
    if isinstance(err, str) and err.strip():
        parts.append(err.strip())
    ed = payload.get("error_description")
    if isinstance(ed, str) and ed.strip():
        parts.append(ed.strip())
    details = payload.get("details")
    if isinstance(details, list):
        for item in details[:4]:
            if not isinstance(item, dict):
                continue
            issue = item.get("issue") or item.get("description")
            field = item.get("field") or item.get("value")
            if issue:
                bits = [str(issue)]
                if field:
                    bits.append(f"({field})")
                parts.append(" ".join(bits))
    ne = payload.get("network_error")
    if isinstance(ne, str) and ne.strip():
        parts.append(ne.strip())
    if parts:
        return " — ".join(parts)[:900]
    try:
        return json.dumps(payload, default=str)[:600]
    except Exception:
        return str(payload)[:600]


def paypal_api_base(*, sandbox: bool) -> str:
    return "https://api-m.sandbox.paypal.com" if sandbox else "https://api-m.paypal.com"


async def get_access_token(*, client_id: str, client_secret: str, base_url: str) -> str:
    token = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("ascii")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                f"{base_url}/v1/oauth2/token",
                headers={
                    "Authorization": f"Basic {token}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={"grant_type": "client_credentials"},
            )
    except httpx.RequestError as exc:
        raise PayPalClientError(0, {"network_error": str(exc)}) from exc
    if r.status_code != 200:
        try:
            detail = r.json()
        except Exception:
            detail = {"raw": r.text[:2000]}
        raise PayPalClientError(r.status_code, detail)
    data = r.json()
    access = data.get("access_token")
    if not isinstance(access, str) or not access.strip():
        raise PayPalClientError(r.status_code, {"error": "no access_token"})
    return access.strip()


def _money_string_from_centavos(centavos: int, currency: str) -> str:
    """PayPal expects decimal string with 2 fraction digits for PHP/USD."""
    if centavos < 0:
        centavos = 0
    whole = centavos // 100
    frac = centavos % 100
    return f"{whole}.{frac:02d}"


def _approve_url_from_order_body(body: Dict[str, Any]) -> Optional[str]:
    links = body.get("links")
    if not isinstance(links, list):
        return None
    for link in links:
        if not isinstance(link, dict):
            continue
        if str(link.get("rel") or "").lower() == "approve":
            href = link.get("href")
            if isinstance(href, str) and href.strip():
                return href.strip()
    return None


async def create_order(
    *,
    access_token: str,
    base_url: str,
    amount_centavos: int,
    currency_code: str,
    custom_id: str,
    description: str,
    return_url: str,
    cancel_url: str,
    reference_id: str,
) -> Tuple[str, str]:
    """
    Create CAPTURE order. Returns (order_id, approve_url).
    custom_id should be Swerte3 user id (string) for reconciliation.
    """
    value = _money_string_from_centavos(amount_centavos, currency_code)
    payload: Dict[str, Any] = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "reference_id": (reference_id or "swerte3")[:256],
                "description": (description or "Swerte3 premium")[:127],
                "custom_id": custom_id[:127],
                "amount": {"currency_code": currency_code.upper(), "value": value},
            }
        ],
        "application_context": {
            "return_url": return_url,
            "cancel_url": cancel_url,
            "user_action": "PAY_NOW",
            "shipping_preference": "NO_SHIPPING",
        },
    }
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            r = await client.post(
                f"{base_url}/v2/checkout/orders",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.RequestError as exc:
        raise PayPalClientError(0, {"network_error": str(exc)}) from exc
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text[:2000]}
    if r.status_code not in (200, 201):
        raise PayPalClientError(r.status_code, body)
    order_id = str(body.get("id") or "")
    approve = _approve_url_from_order_body(body)
    if not order_id or not approve:
        raise PayPalClientError(r.status_code, {"error": "missing order id or approve link", "body": body})
    return order_id, approve


async def get_order(*, access_token: str, base_url: str, order_id: str) -> Dict[str, Any]:
    oid = (order_id or "").strip()
    if not oid:
        raise PayPalClientError(400, {"error": "missing order_id"})
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(
                f"{base_url}/v2/checkout/orders/{oid}",
                headers={"Authorization": f"Bearer {access_token}"},
            )
    except httpx.RequestError as exc:
        raise PayPalClientError(0, {"network_error": str(exc)}) from exc
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text[:2000]}
    if r.status_code != 200:
        raise PayPalClientError(r.status_code, body)
    return body if isinstance(body, dict) else {}


async def capture_order(*, access_token: str, base_url: str, order_id: str) -> Dict[str, Any]:
    oid = (order_id or "").strip()
    if not oid:
        raise PayPalClientError(400, {"error": "missing order_id"})
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            r = await client.post(
                f"{base_url}/v2/checkout/orders/{oid}/capture",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json={},
            )
    except httpx.RequestError as exc:
        raise PayPalClientError(0, {"network_error": str(exc)}) from exc
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text[:2000]}
    if r.status_code not in (200, 201):
        raise PayPalClientError(r.status_code, body)
    return body if isinstance(body, dict) else {}


def centavos_from_paypal_money(currency_code: str, value_str: str) -> int:
    """Convert PayPal amount.value (e.g. '20.00') to integer centavos."""
    try:
        d = Decimal(str(value_str).strip())
    except Exception:
        return 0
    cents = (d * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(cents)


def extract_capture_info(order_body: Dict[str, Any]) -> Optional[Tuple[str, int, Optional[int]]]:
    """
    From Orders API capture response (order JSON), return (capture_id, amount_centavos, user_id).
    """
    status = str(order_body.get("status") or "").upper()
    if status != "COMPLETED":
        return None
    units = order_body.get("purchase_units")
    if not isinstance(units, list) or not units:
        return None
    pu0 = units[0]
    if not isinstance(pu0, dict):
        return None
    custom = pu0.get("custom_id")
    user_id: Optional[int] = None
    if custom is not None and str(custom).strip().isdigit():
        user_id = int(str(custom).strip())
    payments = pu0.get("payments")
    if not isinstance(payments, dict):
        return None
    captures = payments.get("captures")
    if not isinstance(captures, list) or not captures:
        return None
    cap0 = captures[0]
    if not isinstance(cap0, dict):
        return None
    cap_status = str(cap0.get("status") or "").upper()
    if cap_status != "COMPLETED":
        return None
    cap_id = str(cap0.get("id") or "")
    if not cap_id:
        return None
    amt = cap0.get("amount")
    if not isinstance(amt, dict):
        return None
    value = amt.get("value")
    cur = str(amt.get("currency_code") or "PHP")
    if value is None:
        return None
    centavos = centavos_from_paypal_money(cur, str(value))
    return cap_id, centavos, user_id
