"""PayMongo API client and webhook verification."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set, Tuple

import httpx

from app.config import get_settings

PAYMONGO_API_BASE = "https://api.paymongo.com/v1"

# Subset of PayMongo Checkout Session `payment_method_types` (see Create Checkout API).
_CHECKOUT_SUPPORTED = frozenset({
    "gcash",
    "paymaya",
    "card",
    "qrph",
    "grab_pay",
    "shopee_pay",
    "billease",
    "dob",
    "dob_ubp",
    "brankas_bdo",
    "brankas_landbank",
    "brankas_metrobank",
})

def _normalize_capability_pm_type(raw: str) -> str:
    s = raw.strip().lower()
    if s in ("maya", "pay_maya"):
        return "paymaya"
    return s


async def fetch_merchant_enabled_checkout_types(*, secret_key: str) -> Optional[set[str]]:
    """GET /v1/merchants/capabilities/payment_methods — None if request fails or body is unusable."""
    log = logging.getLogger(__name__)
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(
                f"{PAYMONGO_API_BASE}/merchants/capabilities/payment_methods",
                headers={"Authorization": _basic_auth_header(secret_key)},
            )
    except httpx.RequestError as exc:
        log.warning("PayMongo capabilities network error: %s", exc)
        return None
    if r.status_code != 200:
        log.warning("PayMongo capabilities HTTP %s: %s", r.status_code, (r.text or "")[:400])
        return None
    try:
        payload = r.json()
    except json.JSONDecodeError:
        return None
    out: set[str] = set()
    rows: List[Any] = []
    if isinstance(payload, list):
        rows = payload
        data: Any = None
    elif isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            rows = data
        elif isinstance(data, dict):
            rows = [data]
    else:
        return None
    for item in rows:
        if isinstance(item, str) and item.strip():
            out.add(_normalize_capability_pm_type(item))
            continue
        if not isinstance(item, dict):
            continue
        attrs = item.get("attributes")
        if not isinstance(attrs, dict):
            continue
        t = (
            attrs.get("type")
            or attrs.get("name")
            or attrs.get("kind")
            or attrs.get("payment_method_type")
        )
        if isinstance(t, str) and t.strip():
            out.add(_normalize_capability_pm_type(t))

    if not out and isinstance(data, dict):
        attrs = data.get("attributes")
        if isinstance(attrs, dict):
            for key in ("payment_methods", "enabled_payment_methods", "methods"):
                pm = attrs.get(key)
                if isinstance(pm, list):
                    for t in pm:
                        if isinstance(t, str) and t.strip():
                            out.add(_normalize_capability_pm_type(t))
                    break

    if not out:
        log.warning(
            "PayMongo capabilities returned no parseable method types (payload_type=%s)",
            "dict" if isinstance(payload, dict) else ("list(len=%s)" % len(payload) if isinstance(payload, list) else type(payload).__name__),
        )
        return None
    return out


def _primary_checkout_type(provider: str) -> str:
    if provider == "gcash":
        return "gcash"
    if provider == "maya":
        return "paymaya"
    return "card"


async def resolve_payment_method_types_for_checkout(*, secret_key: str, provider: str) -> List[str]:
    """
    Checkout Session uses ``payment_method_types`` (not Payment Intent ``payment_method_allowed``).

    Prefer the rail matching the user's in-app choice. If that method is not enabled on the
    merchant account, PayMongo shows an empty checkout when we send only that type — so we
    optionally append ``qrph`` or fall back when capabilities say so.
    """
    log = logging.getLogger(__name__)
    primary = _primary_checkout_type(provider)
    settings = get_settings()

    if settings.paymongo_skip_capabilities:
        # No capabilities call: request primary first, then QR Ph so QR-only accounts still work.
        return [primary, "qrph"]

    enabled = await fetch_merchant_enabled_checkout_types(secret_key=secret_key)
    if not enabled:
        return [primary, "qrph"]

    if primary in enabled:
        return [primary]

    if "qrph" in enabled:
        log.warning(
            "PayMongo: merchant has no %s in capabilities; checkout will use qrph only",
            primary,
        )
        return ["qrph"]

    # Unknown capability shape: still ask for primary + qrph so checkout is rarely blank.
    return [primary, "qrph"]


@dataclass
class WebhookPaymentInfo:
    payment_id: str
    amount_centavos: int
    status: str
    metadata: Dict[str, Any]
    livemode: bool
    event_type: str
    payment_intent_id: Optional[str] = None
    description: Optional[str] = None
    external_reference_number: Optional[str] = None


def parse_user_id_from_swerte3_markers(*texts: Optional[str]) -> Optional[int]:
    """Match [u123] in description/line name or reference sw3u123a… from checkout reference_number."""
    for raw in texts:
        if not raw or not str(raw).strip():
            continue
        s = str(raw).strip()
        m = re.search(r"\[u(\d{1,12})\]", s, re.I)
        if m:
            return int(m.group(1))
        m = re.search(r"sw3u(\d{1,12})a\d", s, re.I)
        if m:
            return int(m.group(1))
    return None


def _find_checkout_session_id(obj: Any, seen: Optional[Set[int]] = None) -> Optional[str]:
    if seen is None:
        seen = set()
    oid = id(obj)
    if oid in seen:
        return None
    seen.add(oid)
    if isinstance(obj, str) and obj.startswith("cs_") and len(obj) >= 10:
        return obj
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "id" and isinstance(v, str) and v.startswith("cs_") and len(v) >= 10:
                return v
            found = _find_checkout_session_id(v, seen)
            if found:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = _find_checkout_session_id(item, seen)
            if found:
                return found
    return None


def verify_paymongo_signature(
    raw_body: bytes,
    signature_header: str | None,
    *,
    livemode: bool,
) -> bool:
    """Verify Paymongo-Signature: HMAC-SHA256(webhook_secret, f'{t}.{raw_body}'), compare to te vs li."""
    secret = (get_settings().paymongo_webhook_secret or "").strip()
    if not secret:
        return True
    if not signature_header:
        return False
    parts: Dict[str, str] = {}
    for segment in signature_header.split(","):
        segment = segment.strip()
        if "=" in segment:
            k, v = segment.split("=", 1)
            parts[k.strip()] = v.strip()
    t = parts.get("t")
    te = parts.get("te") or ""
    li = parts.get("li") or ""
    expected = li if livemode else te
    if not t or not expected:
        return False
    signed = f"{t}.{raw_body.decode('utf-8')}"
    digest = hmac.new(secret.encode("utf-8"), signed.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, expected)


def parse_livemode_from_body(raw_body: bytes) -> bool:
    """Best-effort livemode for signature verification (test vs live signature slot)."""
    try:
        payload = json.loads(raw_body.decode("utf-8") or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return False
    data = payload.get("data")
    if not isinstance(data, dict):
        return False
    attrs = data.get("attributes")
    if not isinstance(attrs, dict):
        return False
    return bool(attrs.get("livemode"))


def extract_payment_from_webhook(payload: Dict[str, Any]) -> Optional[WebhookPaymentInfo]:
    data = payload.get("data")
    if not isinstance(data, dict) or data.get("type") != "event":
        return None
    outer_attrs = data.get("attributes")
    if not isinstance(outer_attrs, dict):
        return None
    livemode = bool(outer_attrs.get("livemode"))
    event_type = str(outer_attrs.get("type") or "")
    inner = outer_attrs.get("data")
    if not isinstance(inner, dict):
        return None
    itype = inner.get("type")
    inner_attrs = inner.get("attributes")
    if not isinstance(inner_attrs, dict):
        inner_attrs = {}

    def from_payment_obj(pay_obj: Dict[str, Any], meta_fallback: Dict[str, Any]) -> Optional[WebhookPaymentInfo]:
        if pay_obj.get("type") != "payment":
            return None
        pid = str(pay_obj.get("id") or "")
        pattrs = pay_obj.get("attributes")
        if not isinstance(pattrs, dict):
            pattrs = {}
        st = str(pattrs.get("status") or "")
        try:
            amt = int(pattrs.get("amount") or 0)
        except (TypeError, ValueError):
            amt = 0
        pmeta = pattrs.get("metadata")
        merged: Dict[str, Any] = dict(meta_fallback)
        if isinstance(pmeta, dict):
            merged.update(pmeta)
        if not pid:
            return None
        pi_id = str(pattrs.get("payment_intent_id") or "").strip() or None
        desc = pattrs.get("description")
        desc_s = str(desc).strip() if desc is not None and str(desc).strip() else None
        ext_ref = pattrs.get("external_reference_number")
        ext_s = str(ext_ref).strip() if ext_ref is not None and str(ext_ref).strip() else None
        return WebhookPaymentInfo(
            pid,
            amt,
            st,
            merged,
            livemode,
            event_type,
            pi_id,
            desc_s,
            ext_s,
        )

    meta_cs = inner_attrs.get("metadata") if isinstance(inner_attrs.get("metadata"), dict) else {}

    if itype == "payment":
        return from_payment_obj(inner, meta_cs)

    if itype == "checkout_session":

        def iter_payment_wrappers() -> List[Any]:
            raw = inner_attrs.get("payments") or []
            if not isinstance(raw, list):
                return []
            return raw

        for p in iter_payment_wrappers():
            if not isinstance(p, dict):
                continue
            po = p.get("data")
            if isinstance(po, dict):
                info = from_payment_obj(po, meta_cs)
                if info and info.status.lower() == "paid":
                    return info
        for p in iter_payment_wrappers():
            if not isinstance(p, dict):
                continue
            po = p.get("data")
            if isinstance(po, dict):
                info = from_payment_obj(po, meta_cs)
                if info:
                    return info
        return None

    if itype == "link":
        raw = inner_attrs.get("payments") or []
        if not isinstance(raw, list):
            return None
        meta_link = inner_attrs.get("metadata") if isinstance(inner_attrs.get("metadata"), dict) else {}
        for p in raw:
            if not isinstance(p, dict):
                continue
            po = p.get("data")
            if isinstance(po, dict):
                info = from_payment_obj(po, meta_link)
                if info and info.status.lower() == "paid":
                    return info
        for p in raw:
            if not isinstance(p, dict):
                continue
            po = p.get("data")
            if isinstance(po, dict):
                info = from_payment_obj(po, meta_link)
                if info:
                    return info
        return None

    if itype == "payment_intent":
        raw = inner_attrs.get("payments") or []
        if not isinstance(raw, list):
            return None
        meta_pi = inner_attrs.get("metadata") if isinstance(inner_attrs.get("metadata"), dict) else {}
        for p in raw:
            if not isinstance(p, dict):
                continue
            po = p.get("data")
            if isinstance(po, dict):
                info = from_payment_obj(po, meta_pi)
                if info and info.status.lower() == "paid":
                    return info
        for p in raw:
            if not isinstance(p, dict):
                continue
            po = p.get("data")
            if isinstance(po, dict):
                info = from_payment_obj(po, meta_pi)
                if info:
                    return info
        return None

    return None


async def fetch_payment_resource(*, secret_key: str, payment_id: str) -> Optional[Dict[str, Any]]:
    log = logging.getLogger(__name__)
    pid = (payment_id or "").strip()
    if not pid:
        return None
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(
                f"{PAYMONGO_API_BASE}/payments/{pid}",
                headers={"Authorization": _basic_auth_header(secret_key)},
            )
    except httpx.RequestError as exc:
        log.warning("PayMongo payment GET failed: %s", exc)
        return None
    if r.status_code != 200:
        log.warning("PayMongo payment HTTP %s: %s", r.status_code, (r.text or "")[:400])
        return None
    try:
        payload = r.json()
    except json.JSONDecodeError:
        return None
    data = payload.get("data") if isinstance(payload, dict) else None
    return data if isinstance(data, dict) else None


async def fetch_checkout_session_metadata(*, secret_key: str, checkout_session_id: str) -> Dict[str, Any]:
    log = logging.getLogger(__name__)
    cid = (checkout_session_id or "").strip()
    if not cid:
        return {}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(
                f"{PAYMONGO_API_BASE}/checkout_sessions/{cid}",
                headers={"Authorization": _basic_auth_header(secret_key)},
            )
    except httpx.RequestError as exc:
        log.warning("PayMongo checkout_session GET failed: %s", exc)
        return {}
    if r.status_code != 200:
        log.warning("PayMongo checkout_session HTTP %s: %s", r.status_code, (r.text or "")[:400])
        return {}
    try:
        payload = r.json()
    except json.JSONDecodeError:
        return {}
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        return {}
    attrs = data.get("attributes")
    if not isinstance(attrs, dict):
        return {}
    m = attrs.get("metadata")
    return dict(m) if isinstance(m, dict) else {}


async def fetch_payment_intent_metadata(*, secret_key: str, payment_intent_id: str) -> Dict[str, Any]:
    """
    Checkout Session metadata (e.g. user_id) is often on the Payment Intent, not on payment.paid payloads.
    """
    log = logging.getLogger(__name__)
    pid = (payment_intent_id or "").strip()
    if not pid:
        return {}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(
                f"{PAYMONGO_API_BASE}/payment_intents/{pid}",
                headers={"Authorization": _basic_auth_header(secret_key)},
            )
    except httpx.RequestError as exc:
        log.warning("PayMongo payment_intent fetch failed: %s", exc)
        return {}
    if r.status_code != 200:
        log.warning("PayMongo payment_intent HTTP %s: %s", r.status_code, (r.text or "")[:400])
        return {}
    try:
        payload = r.json()
    except json.JSONDecodeError:
        return {}
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        return {}
    attrs = data.get("attributes")
    if not isinstance(attrs, dict):
        return {}
    m = attrs.get("metadata")
    return dict(m) if isinstance(m, dict) else {}


def _meta_has_user_id(meta: Dict[str, Any]) -> bool:
    u = meta.get("user_id")
    return u is not None and str(u).strip().isdigit()


async def enrich_metadata_for_swerte3_user(
    *,
    secret_key: str,
    info: WebhookPaymentInfo,
    initial_meta: Dict[str, Any],
) -> Tuple[Dict[str, Any], Optional[str]]:
    """
    Merge metadata from webhook, description markers, Payment Intent, GET payment, and checkout session.
    Returns (metadata dict, checkout_session_id if discovered for DB binding fallback).
    """
    log = logging.getLogger(__name__)
    meta = dict(initial_meta)
    checkout_session_id: Optional[str] = None

    uid = parse_user_id_from_swerte3_markers(info.description, info.external_reference_number)
    if uid is not None:
        meta.setdefault("user_id", str(uid))

    if not _meta_has_user_id(meta) and info.payment_intent_id:
        pi_meta = await fetch_payment_intent_metadata(
            secret_key=secret_key, payment_intent_id=info.payment_intent_id
        )
        for k, v in (pi_meta or {}).items():
            if k not in meta or not str(meta.get(k) or "").strip():
                meta[k] = v

    if not _meta_has_user_id(meta):
        pay_data = await fetch_payment_resource(secret_key=secret_key, payment_id=info.payment_id)
        if pay_data:
            checkout_session_id = _find_checkout_session_id(pay_data)
            pattrs = pay_data.get("attributes")
            if isinstance(pattrs, dict):
                desc = pattrs.get("description")
                if desc is not None and str(desc).strip():
                    uid2 = parse_user_id_from_swerte3_markers(str(desc).strip())
                    if uid2 is not None:
                        meta.setdefault("user_id", str(uid2))
                ext = pattrs.get("external_reference_number")
                if ext is not None and str(ext).strip():
                    uid3 = parse_user_id_from_swerte3_markers(str(ext).strip())
                    if uid3 is not None:
                        meta.setdefault("user_id", str(uid3))
                pm = pattrs.get("metadata")
                if isinstance(pm, dict):
                    for k, v in pm.items():
                        if k not in meta or not str(meta.get(k) or "").strip():
                            meta[k] = v

    if not _meta_has_user_id(meta) and checkout_session_id:
        cs_meta = await fetch_checkout_session_metadata(
            secret_key=secret_key, checkout_session_id=checkout_session_id
        )
        for k, v in (cs_meta or {}).items():
            if k not in meta or not str(meta.get(k) or "").strip():
                meta[k] = v

    if not _meta_has_user_id(meta):
        log.warning(
            "PayMongo user resolution still missing user_id after enrichment payment_id=%s cs=%s meta_keys=%s",
            info.payment_id,
            checkout_session_id,
            list(meta.keys()),
        )

    return meta, checkout_session_id


def _basic_auth_header(secret_key: str) -> str:
    token = base64.b64encode(f"{secret_key}:".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


async def create_checkout_session(
    *,
    secret_key: str,
    line_item_amount_centavos: int,
    description: str,
    metadata: Dict[str, str],
    payment_method_types: List[str],
    success_url: Optional[str],
    cancel_url: Optional[str],
    billing: Optional[Dict[str, str]] = None,
    reference_number: Optional[str] = None,
) -> Dict[str, Any]:
    attributes: Dict[str, Any] = {
        "line_items": [
            {
                "amount": line_item_amount_centavos,
                "currency": "PHP",
                "name": (description or "Swerte3 premium")[:255],
                "quantity": 1,
            }
        ],
        "payment_method_types": payment_method_types,
        "description": description[:255] if description else None,
        "metadata": metadata,
    }
    if reference_number and reference_number.strip():
        attributes["reference_number"] = reference_number.strip()[:255]
    if attributes["description"] is None:
        del attributes["description"]
    if billing:
        attributes["billing"] = billing
    if success_url:
        attributes["success_url"] = success_url
    if cancel_url:
        attributes["cancel_url"] = cancel_url
    body = {"data": {"attributes": attributes}}
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            r = await client.post(
                f"{PAYMONGO_API_BASE}/checkout_sessions",
                json=body,
                headers={
                    "Authorization": _basic_auth_header(secret_key),
                    "Content-Type": "application/json",
                },
            )
    except httpx.RequestError as exc:
        raise PayMongoClientError(0, {"network_error": str(exc)}) from exc
    if r.status_code >= 400:
        try:
            detail = r.json()
        except json.JSONDecodeError:
            detail = {"raw": r.text[:2000]}
        raise PayMongoClientError(r.status_code, detail)
    try:
        return r.json()
    except json.JSONDecodeError:
        raise PayMongoClientError(r.status_code, {"raw": r.text[:2000]})


class PayMongoClientError(Exception):
    def __init__(self, status_code: int, payload: Any):
        self.status_code = status_code
        self.payload = payload
        super().__init__(str(payload))
