"""Payments: PayMongo (hosted checkout) or PayPal (Orders + capture) — chosen by PAYMENT_PROVIDER."""
from __future__ import annotations

import json
import logging
import secrets
from typing import Any, Dict, Literal, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user
from app.models.payment import PaymongoCheckoutBinding, PaymentEvent, PaypalOrderBinding
from app.models.user import User
from app.services.paypal import (
    PayPalClientError,
    capture_order,
    create_order,
    describe_paypal_error,
    extract_capture_info,
    get_access_token,
    get_order,
    paypal_api_base,
)
from app.services.paymongo import (
    PayMongoClientError,
    create_checkout_session,
    enrich_metadata_for_swerte3_user,
    extract_payment_from_webhook,
    parse_livemode_from_body,
    resolve_payment_method_types_for_checkout,
    verify_paymongo_signature,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["payments"])

# Must match mobile `app.json` → expo.scheme (used after PayMongo checkout).
_APP_CHECKOUT_DEEP_LINK = "swerte3://checkout-done"

_PESO_PER_TOKEN = 2
CHECKOUT_MIN_AMOUNT_PESOS = 20


def _provider() -> Literal["paymongo", "paypal"]:
    p = (get_settings().payment_provider or "paymongo").strip().lower()
    return "paypal" if p == "paypal" else "paymongo"


def _paymongo_secret_configured() -> bool:
    return bool((get_settings().paymongo_secret_key or "").strip())


def _paypal_configured() -> bool:
    s = get_settings()
    return bool((s.paypal_client_id or "").strip() and (s.paypal_client_secret or "").strip())


class PaymentConfigResponse(BaseModel):
    checkout_provider: Literal["paymongo", "paypal"]
    # URL the API uses for PayMongo success when the app does not override (matches openAuthSession redirect).
    paymongo_auth_return_url: Optional[str] = None


def _client_return_url_allowed(url: str) -> bool:
    u = (url or "").strip()
    if not u or len(u) > 512:
        return False
    scheme = (urlparse(u).scheme or "").lower()
    return scheme in ("swerte3", "exp", "exps", "https")


def _paymongo_checkout_return_urls(body: "CheckoutRequest") -> tuple[str, str]:
    """Resolve success/cancel URLs for PayMongo (always non-empty)."""
    settings = get_settings()
    rs = (body.return_success_url or "").strip()
    rc = (body.return_cancel_url or "").strip()
    if _client_return_url_allowed(rs) or _client_return_url_allowed(rc):
        success = rs if _client_return_url_allowed(rs) else rc
        cancel = rc if _client_return_url_allowed(rc) else success
        return success, cancel
    succ = (settings.paymongo_checkout_success_url or "").strip() or _APP_CHECKOUT_DEEP_LINK
    canc = (settings.paymongo_checkout_cancel_url or "").strip() or succ
    return succ, canc


@router.get("/config", response_model=PaymentConfigResponse)
def payments_config():
    """Tell the app which checkout flow is active (no secrets)."""
    prov = _provider()
    hint: Optional[str] = None
    if prov == "paymongo":
        hint, _ = _paymongo_checkout_return_urls(
            CheckoutRequest(amount_pesos=CHECKOUT_MIN_AMOUNT_PESOS, provider="gcash")
        )
    return PaymentConfigResponse(checkout_provider=prov, paymongo_auth_return_url=hint)


class TokenTopupRequest(BaseModel):
    provider: str = Field(..., pattern="^(gcash|maya|gotyme)$")
    amount_pesos: int = Field(..., ge=CHECKOUT_MIN_AMOUNT_PESOS)


class TokenTopupResponse(BaseModel):
    provider: str
    amount_pesos: int
    tokens_added: int
    premium_credits: int


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    amount_pesos: int = Field(..., ge=CHECKOUT_MIN_AMOUNT_PESOS)
    provider: str = Field(default="gcash", pattern="^(gcash|maya|gotyme)$")
    # Mobile sends expo-linking URLs (exp://...) in Expo Go, or swerte3:// with dev/production builds.
    return_success_url: Optional[str] = Field(default=None, max_length=512)
    return_cancel_url: Optional[str] = Field(default=None, max_length=512)


class CheckoutResponse(BaseModel):
    checkout_url: str
    checkout_session_id: str
    amount_pesos: int


class PaypalCaptureRequest(BaseModel):
    order_id: str = Field(..., min_length=6, max_length=64)


class PaypalCaptureResponse(BaseModel):
    premium_credits: int
    tokens_added: int
    amount_pesos: int


def _grant_premium_credits(db: Session, user_id: int, amount_centavos: int) -> None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return
    peso_units = amount_centavos // 100
    slots = peso_units // _PESO_PER_TOKEN
    add = slots * get_settings().premium_credits_per_payment
    if add < 1:
        return
    user.premium_credits = int(user.premium_credits or 0) + add
    db.commit()


def _tokens_added_for_centavos(amount_centavos: int) -> int:
    peso_units = amount_centavos // 100
    slots = peso_units // _PESO_PER_TOKEN
    return max(0, slots * get_settings().premium_credits_per_payment)


def _clear_paypal_binding(db: Session, order_id: str) -> None:
    oid = (order_id or "").strip()
    if not oid:
        return
    db.query(PaypalOrderBinding).filter(PaypalOrderBinding.order_id == oid).delete()
    db.commit()


def _clear_paymongo_checkout_binding(db: Session, checkout_session_id: Optional[str]) -> None:
    if not checkout_session_id or not checkout_session_id.strip():
        return
    db.query(PaymongoCheckoutBinding).filter(
        PaymongoCheckoutBinding.checkout_session_id == checkout_session_id.strip()
    ).delete()
    db.commit()


def _gateway_blocks_dev_topup() -> bool:
    if _provider() == "paymongo" and _paymongo_secret_configured():
        return True
    if _provider() == "paypal" and _paypal_configured():
        return True
    return False


# --- PayMongo: return to app (HTTPS — mobile browsers handle this better than raw custom schemes) ---


def _paymongo_return_html(*, title: str, lead: str) -> str:
    def esc(s: str) -> str:
        return (
            s.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )

    t, l = esc(title), esc(lead)
    href = _APP_CHECKOUT_DEEP_LINK
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{t}</title>
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 2rem; max-width: 28rem; line-height: 1.5; }}
    a {{ color: #0f6b3f; font-weight: 600; }}
  </style>
  <script>
    function openApp() {{
      window.location.href = "{href}";
    }}
    setTimeout(openApp, 400);
  </script>
</head>
<body>
  <h1>{t}</h1>
  <p>{l}</p>
  <p><a href="{href}">Open Swerte3</a> if the app did not open.</p>
</body>
</html>
"""


@router.get("/paymongo/app-success", response_class=HTMLResponse)
async def paymongo_app_success_landing():
    """Set PAYMONGO_CHECKOUT_SUCCESS_URL to this path on your public API (e.g. ngrok)."""
    return HTMLResponse(
        _paymongo_return_html(
            title="Payment received",
            lead="Taking you back to Swerte3. Your balance may take a few seconds to update.",
        )
    )


@router.get("/paymongo/app-cancel", response_class=HTMLResponse)
async def paymongo_app_cancel_landing():
    """Set PAYMONGO_CHECKOUT_CANCEL_URL to this path on your public API (e.g. ngrok)."""
    return HTMLResponse(
        _paymongo_return_html(
            title="Checkout closed",
            lead="You can return to the app and try again when you are ready.",
        )
    )


# --- PayMongo webhook ---


@router.post("/webhook/paymongo")
async def paymongo_webhook(
    request: Request,
    db: Session = Depends(get_db),
    paymongo_signature: str | None = Header(None, alias="Paymongo-Signature"),
):
    body = await request.body()
    livemode = parse_livemode_from_body(body)
    if not verify_paymongo_signature(body, paymongo_signature, livemode=livemode):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")
    try:
        payload: Dict[str, Any] = json.loads(body.decode() or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    info = extract_payment_from_webhook(payload)
    if not info:
        return {"received": True, "processed": False}

    if info.status.lower() != "paid":
        return {"received": True, "processed": False, "status": info.status}

    sk = (get_settings().paymongo_secret_key or "").strip()
    meta = dict(info.metadata)
    checkout_session_id: Optional[str] = None
    if sk:
        meta, checkout_session_id = await enrich_metadata_for_swerte3_user(
            secret_key=sk, info=info, initial_meta=meta
        )
    if (meta.get("user_id") is None or not str(meta.get("user_id")).strip().isdigit()) and checkout_session_id:
        bind = (
            db.query(PaymongoCheckoutBinding)
            .filter(PaymongoCheckoutBinding.checkout_session_id == checkout_session_id)
            .first()
        )
        if bind:
            meta["user_id"] = str(bind.user_id)

    uid = meta.get("user_id")
    user_id = int(uid) if uid is not None and str(uid).strip().isdigit() else None

    existing = db.query(PaymentEvent).filter(PaymentEvent.external_id == info.payment_id).first()
    if existing:
        if existing.user_id is None and user_id is not None:
            existing.user_id = user_id
            db.commit()
            _grant_premium_credits(db, user_id, info.amount_centavos)
            _clear_paymongo_checkout_binding(db, checkout_session_id)
            logger.info(
                "PayMongo webhook: backfilled user_id=%s for payment %s",
                user_id,
                info.payment_id,
            )
            return {"received": True, "processed": True, "backfilled": True}
        return {"received": True, "duplicate": True}

    ev = PaymentEvent(
        external_id=info.payment_id,
        amount_centavos=info.amount_centavos,
        status=info.status,
        user_id=user_id,
        provider="paymongo",
        raw_payload=json.dumps(payload, default=str)[:8000],
    )
    db.add(ev)
    db.commit()

    if user_id:
        _grant_premium_credits(db, user_id, info.amount_centavos)
        _clear_paymongo_checkout_binding(db, checkout_session_id)
    else:
        logger.error(
            "PayMongo paid webhook: cannot resolve user_id. payment_id=%s pi=%s cs=%s",
            info.payment_id,
            info.payment_intent_id,
            checkout_session_id,
        )

    return {"received": True, "processed": True}


# --- Checkout (PayMongo or PayPal) ---


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if _provider() == "paymongo":
        return await _create_paymongo_checkout(body, db, current_user)
    return await _create_paypal_checkout(body, db, current_user)


async def _create_paymongo_checkout(
    body: CheckoutRequest,
    db: Session,
    current_user: User,
) -> CheckoutResponse:
    settings = get_settings()
    sk = (settings.paymongo_secret_key or "").strip()
    if not sk:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PayMongo is not configured (missing PAYMONGO_SECRET_KEY).",
        )

    amount_centavos = int(body.amount_pesos) * 100
    desc = f"Swerte3 premium top-up (₱{body.amount_pesos}) [u{current_user.id}]"
    meta = {"user_id": str(current_user.id)}
    reference_number = f"sw3u{current_user.id}a{amount_centavos}x{secrets.token_hex(4)}"
    methods = await resolve_payment_method_types_for_checkout(secret_key=sk, provider=body.provider)
    success_url, cancel_url = _paymongo_checkout_return_urls(body)
    logger.info(
        "PayMongo checkout: user_id=%s amount_pesos=%s provider=%s methods=%s return=%s",
        current_user.id,
        body.amount_pesos,
        body.provider,
        methods,
        success_url[:80] + ("…" if len(success_url) > 80 else ""),
    )

    try:
        raw = await create_checkout_session(
            secret_key=sk,
            line_item_amount_centavos=amount_centavos,
            description=desc,
            metadata=meta,
            payment_method_types=methods,
            success_url=success_url,
            cancel_url=cancel_url,
            reference_number=reference_number,
        )
    except PayMongoClientError as e:
        logger.warning("PayMongo checkout error: %s", e.payload)
        if e.status_code == 0:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Cannot reach PayMongo (network). Try again.",
            ) from e
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="PayMongo rejected checkout. Check server logs.",
        ) from e

    data = raw.get("data") if isinstance(raw, dict) else None
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="Invalid PayMongo response")
    cs_id = str(data.get("id") or "")
    attrs = data.get("attributes")
    if not isinstance(attrs, dict):
        raise HTTPException(status_code=502, detail="Invalid PayMongo response")
    checkout_url = str(attrs.get("checkout_url") or "")
    if not checkout_url or not cs_id:
        raise HTTPException(status_code=502, detail="PayMongo did not return checkout_url")

    bind_row = db.get(PaymongoCheckoutBinding, cs_id)
    if bind_row:
        bind_row.user_id = current_user.id
        bind_row.amount_centavos = amount_centavos
    else:
        db.add(
            PaymongoCheckoutBinding(
                checkout_session_id=cs_id,
                user_id=current_user.id,
                amount_centavos=amount_centavos,
            )
        )
    db.commit()

    return CheckoutResponse(
        checkout_url=checkout_url,
        checkout_session_id=cs_id,
        amount_pesos=body.amount_pesos,
    )


async def _create_paypal_checkout(
    body: CheckoutRequest,
    db: Session,
    current_user: User,
) -> CheckoutResponse:
    if not _paypal_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PayPal is not configured (set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET).",
        )

    settings = get_settings()
    amount_centavos = int(body.amount_pesos) * 100
    base = paypal_api_base(sandbox=settings.paypal_sandbox)
    desc = f"Swerte3 premium top-up (₱{body.amount_pesos})"
    return_url = (settings.paypal_return_url or "").strip()
    cancel_url = (settings.paypal_cancel_url or "").strip()
    if not return_url or not cancel_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Set PAYPAL_RETURN_URL and PAYPAL_CANCEL_URL.",
        )

    try:
        access = await get_access_token(
            client_id=settings.paypal_client_id.strip(),
            client_secret=settings.paypal_client_secret.strip(),
            base_url=base,
        )
        order_id, approve_url = await create_order(
            access_token=access,
            base_url=base,
            amount_centavos=amount_centavos,
            currency_code=(settings.paypal_currency or "PHP").strip().upper(),
            custom_id=str(current_user.id),
            description=desc,
            return_url=return_url,
            cancel_url=cancel_url,
            reference_id=f"u{current_user.id}-{secrets.token_hex(6)}",
        )
    except PayPalClientError as e:
        logger.warning("PayPal create order error: %s", e.payload)
        if e.status_code == 0:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Cannot reach PayPal: {describe_paypal_error(e.payload)}",
            ) from e
        hint = describe_paypal_error(e.payload)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                f"PayPal checkout failed ({e.status_code}): {hint}. "
                "Sandbox keys need PAYPAL_SANDBOX=true. Try PAYPAL_CURRENCY=USD if needed."
            ),
        ) from e

    row = db.get(PaypalOrderBinding, order_id)
    if row:
        row.user_id = current_user.id
        row.amount_centavos = amount_centavos
    else:
        db.add(
            PaypalOrderBinding(
                order_id=order_id,
                user_id=current_user.id,
                amount_centavos=amount_centavos,
            )
        )
    db.commit()

    logger.info("PayPal checkout: user_id=%s order_id=%s", current_user.id, order_id)
    return CheckoutResponse(
        checkout_url=approve_url,
        checkout_session_id=order_id,
        amount_pesos=body.amount_pesos,
    )


@router.post("/paypal/capture", response_model=PaypalCaptureResponse)
async def paypal_capture_order(
    body: PaypalCaptureRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if _provider() != "paypal":
        raise HTTPException(
            status_code=503,
            detail="PayPal capture is only used when PAYMENT_PROVIDER=paypal.",
        )
    if not _paypal_configured():
        raise HTTPException(status_code=503, detail="PayPal is not configured.")

    oid = body.order_id.strip()
    binding = (
        db.query(PaypalOrderBinding)
        .filter(
            PaypalOrderBinding.order_id == oid,
            PaypalOrderBinding.user_id == current_user.id,
        )
        .first()
    )
    if not binding:
        raise HTTPException(status_code=404, detail="No pending PayPal checkout for this order and account.")

    settings = get_settings()
    base = paypal_api_base(sandbox=settings.paypal_sandbox)
    try:
        access = await get_access_token(
            client_id=settings.paypal_client_id.strip(),
            client_secret=settings.paypal_client_secret.strip(),
            base_url=base,
        )
        order_json = await get_order(access_token=access, base_url=base, order_id=oid)
    except PayPalClientError as e:
        logger.warning("PayPal get order error: %s", e.payload)
        raise HTTPException(
            status_code=502,
            detail=f"Could not load PayPal order: {describe_paypal_error(e.payload)}",
        ) from e

    st = str(order_json.get("status") or "").upper()
    if st == "COMPLETED":
        final_body: Dict[str, Any] = order_json
    elif st == "APPROVED":
        try:
            final_body = await capture_order(access_token=access, base_url=base, order_id=oid)
        except PayPalClientError as e:
            logger.warning("PayPal capture error: %s", e.payload)
            raise HTTPException(
                status_code=502,
                detail=f"PayPal capture failed: {describe_paypal_error(e.payload)}",
            ) from e
    else:
        raise HTTPException(
            status_code=409,
            detail=f"PayPal order is not ready yet (status: {st}). Approve in PayPal, then try again.",
        )

    extracted = extract_capture_info(final_body)
    if not extracted:
        raise HTTPException(status_code=502, detail="Invalid PayPal capture response.")

    capture_id, amount_centavos, meta_uid = extracted
    if meta_uid is not None and meta_uid != current_user.id:
        logger.error("PayPal custom_id mismatch: expected user %s got %s", current_user.id, meta_uid)
        raise HTTPException(status_code=400, detail="Payment does not match this account.")

    existing = db.query(PaymentEvent).filter(PaymentEvent.external_id == capture_id).first()
    if existing:
        _clear_paypal_binding(db, oid)
        user = db.query(User).filter(User.id == current_user.id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return PaypalCaptureResponse(
            premium_credits=int(user.premium_credits or 0),
            tokens_added=0,
            amount_pesos=amount_centavos // 100,
        )

    ev = PaymentEvent(
        external_id=capture_id,
        amount_centavos=amount_centavos,
        status="paid",
        user_id=current_user.id,
        provider="paypal",
        raw_payload=json.dumps(final_body, default=str)[:8000],
    )
    db.add(ev)
    db.commit()

    _grant_premium_credits(db, current_user.id, amount_centavos)
    _clear_paypal_binding(db, oid)

    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    tokens_added = _tokens_added_for_centavos(amount_centavos)
    return PaypalCaptureResponse(
        premium_credits=int(user.premium_credits or 0),
        tokens_added=tokens_added,
        amount_pesos=amount_centavos // 100,
    )


@router.post("/topup", response_model=TokenTopupResponse)
def topup_tokens(
    body: TokenTopupRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if _gateway_blocks_dev_topup():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Direct top-up is disabled when a payment gateway is active. Use Add Tokens / checkout.",
        )

    tokens_to_add = body.amount_pesos // _PESO_PER_TOKEN
    if tokens_to_add < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Minimum top-up is {CHECKOUT_MIN_AMOUNT_PESOS} pesos.",
        )

    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.premium_credits = int(user.premium_credits or 0) + tokens_to_add
    db.commit()
    db.refresh(user)

    return TokenTopupResponse(
        provider=body.provider,
        amount_pesos=body.amount_pesos,
        tokens_added=tokens_to_add,
        premium_credits=int(user.premium_credits or 0),
    )


_PAYPAL_LANDING_CSS = "body{font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#1a202c;}h1{font-size:1.25rem;}p{color:#4a5568;}"


@router.get("/paypal/return", response_class=HTMLResponse, include_in_schema=False)
def paypal_browser_return():
    html = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Swerte3 — PayPal</title><style>{_PAYPAL_LANDING_CSS}</style></head>
<body>
<h1>Payment approved</h1>
<p>Close this tab, open <strong>Swerte3</strong>, and tap <strong>Complete PayPal payment</strong> on Home.</p>
</body></html>"""
    return HTMLResponse(content=html)


@router.get("/paypal/cancel", response_class=HTMLResponse, include_in_schema=False)
def paypal_browser_cancel():
    html = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Swerte3 — PayPal</title><style>{_PAYPAL_LANDING_CSS}</style></head>
<body>
<h1>Checkout cancelled</h1>
<p>No charge was made. Close this tab and return to Swerte3.</p>
</body></html>"""
    return HTMLResponse(content=html)
