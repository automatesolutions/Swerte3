"""Jev: the decision layer on the login path.

Jev decides *how* login work runs (in the request or later, which timeout, which path) and
measures it. It never decides *whether* authentication, rate limiting or fraud checks run:
those stay in the routes and always execute.

Every decision and every timed auth request is one JSON line on stdout, which Cloud Logging
stores as jsonPayload. Never pass phone numbers, codes or tokens in here unmasked.
"""
from __future__ import annotations

import json
import sys
import time
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Iterator, Optional

import httpx

_INSTANCE_T0 = time.perf_counter()
_requests_served = 0

# Per-request stage timings, emitted as a Server-Timing header by the middleware in main.py.
_stages: ContextVar[Optional[list[tuple[str, float]]]] = ContextVar("jev_stages", default=None)


def log(event: str, **fields: Any) -> None:
    """One structured line for Cloud Logging. `severity` maps to the log level there."""
    fields.setdefault("severity", "INFO")
    print(json.dumps({"event": event, **fields}, default=str), file=sys.stdout, flush=True)


def decide(what: str, choice: str, why: str, **extra: Any) -> str:
    """Record a Jev decision (what, which choice, why) and return the choice."""
    log("jev_decision", what=what, choice=choice, why=why, **extra)
    return choice


def mask_phone(phone: Optional[str]) -> str:
    if not phone:
        return "-"
    return f"{phone[:4]}***{phone[-2:]}" if len(phone) > 6 else "***"


# --- request timing ---------------------------------------------------------------------------


def begin_request() -> tuple[bool, float]:
    """Return (is_first_request_on_this_instance, instance_age_seconds)."""
    global _requests_served
    _requests_served += 1
    _stages.set([])
    return _requests_served == 1, time.perf_counter() - _INSTANCE_T0


def collected_stages() -> list[tuple[str, float]]:
    return _stages.get() or []


@contextmanager
def stage(name: str) -> Iterator[None]:
    """Time one step of a request (db, sms, token) into the Server-Timing header."""
    t0 = time.perf_counter()
    try:
        yield
    finally:
        bucket = _stages.get()
        if bucket is not None:
            bucket.append((name, (time.perf_counter() - t0) * 1000))


def server_timing_header(total_ms: float) -> str:
    parts = [f"{name};dur={ms:.1f}" for name, ms in collected_stages()]
    parts.append(f"app;dur={total_ms:.1f}")
    return ", ".join(parts)


# --- policies ---------------------------------------------------------------------------------

# The SMS provider is the only external call on the login path. Fail fast with a clear message
# instead of holding the user on a spinner for the old 30 s httpx timeout.
SMS_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


def sms_policy(provider: str) -> httpx.Timeout:
    decide(
        "sms_send",
        "single_attempt",
        "no automatic retry: a retried send can deliver two codes and bill twice; the user can resend after the cooldown",
        provider=provider,
        timeout_s=SMS_TIMEOUT.read,
    )
    return SMS_TIMEOUT


def startup_report(boot_t0: float) -> None:
    """Log how long this instance took from first app import to ready, and confirm that the ML
    stack stayed out of startup (auth routes never need it)."""
    heavy = [m for m in ("xgboost", "sklearn", "pandas", "openai") if m in sys.modules]
    decide(
        "startup_work",
        "auth_ready_without_ml" if not heavy else "ml_loaded_at_startup",
        "xgboost, sklearn, pandas and openai load on first use so login answers without them",
        boot_to_ready_ms=round((time.perf_counter() - boot_t0) * 1000, 1),
        heavy_modules_loaded=heavy,
    )
