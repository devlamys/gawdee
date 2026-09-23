"""
Gawdee FastAPI Backend
Session management using signed cookies (replaces PHP sessions)
"""

import json
import hmac
import hashlib
import base64
import time
from typing import Any
from fastapi import Request, Response
from .database import get_secret_key
from .core.config import settings


def _sign(payload: str) -> str:
    key = get_secret_key()
    sig = hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def _verify_and_decode(cookie_value: str) -> dict:
    try:
        payload, sig = cookie_value.rsplit(".", 1)
        key = get_secret_key()
        expected = hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            return {}
        data = json.loads(base64.b64decode(payload.encode()).decode())
        if not isinstance(data, dict):
            return {}
        # Check expiry
        if data.get("_exp", 0) < time.time():
            return {}
        return data
    except Exception:
        return {}


async def get_session(request: Request) -> dict:
    """Read the session from the signed cookie."""
    cookie = request.cookies.get(settings.SESSION_COOKIE_NAME, "")
    if not cookie:
        return {}
    return _verify_and_decode(cookie)


async def save_session(response: Response, session: dict) -> None:
    """Write the session to the signed cookie."""
    session["_exp"] = time.time() + settings.SESSION_COOKIE_MAX_AGE_SECONDS
    payload = base64.b64encode(json.dumps(session, ensure_ascii=False).encode()).decode()
    signed = _sign(payload)
    response.set_cookie(
        settings.SESSION_COOKIE_NAME,
        signed,
        max_age=settings.SESSION_COOKIE_MAX_AGE_SECONDS,
        httponly=settings.SESSION_COOKIE_HTTPONLY,
        samesite=settings.SESSION_COOKIE_SAMESITE,
        secure=settings.SESSION_COOKIE_SECURE,
        path=settings.SESSION_COOKIE_PATH,
    )


async def set_session_value(request: Request, key: str, value: Any) -> None:
    """Helper: mutate one session key (NOTE: must call save_session on the Response)."""
    # We store session mutations on the request state for middleware to persist
    if not hasattr(request.state, "session_mutations"):
        request.state.session_mutations = {}
    request.state.session_mutations[key] = value


async def get_session_value(request: Request, key: str, default: Any = None) -> Any:
    session = await get_session(request)
    mutations = getattr(request.state, "session_mutations", {})
    if key in mutations:
        return mutations[key]
    return session.get(key, default)


async def clear_session(request: Request) -> None:
    if not hasattr(request.state, "session_mutations"):
        request.state.session_mutations = {}
    request.state.session_mutations["_clear"] = True
