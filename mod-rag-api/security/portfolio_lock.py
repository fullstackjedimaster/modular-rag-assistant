# security/portfolio_lock.py

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse

EMBED_SECRET = os.getenv("EMBED_SECRET", "")

PORTFOLIO_LOCK_ENABLED = (
        os.getenv("PORTFOLIO_LOCK_ENABLED", "false").lower() == "true"
)

ALLOWED_PATHS = {
    "/health",
}


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def verify_token(token: str) -> dict[str, Any]:
    if not EMBED_SECRET:
        raise ValueError("EMBED_SECRET is not set")

    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("invalid token format")

    header_b64, payload_b64, signature_b64 = parts
    signed = f"{header_b64}.{payload_b64}".encode("utf-8")

    expected_sig = hmac.new(
        EMBED_SECRET.encode("utf-8"),
        signed,
        hashlib.sha256,
    ).digest()

    actual_sig = _b64url_decode(signature_b64)

    if not hmac.compare_digest(expected_sig, actual_sig):
        raise ValueError("invalid token signature")

    header = json.loads(_b64url_decode(header_b64))
    payload = json.loads(_b64url_decode(payload_b64))

    if header.get("alg") != "HS256":
        raise ValueError("invalid token algorithm")

    now = int(time.time())

    exp = payload.get("exp")
    if not isinstance(exp, int) or exp < now:
        raise ValueError("token expired")

    iat = payload.get("iat")
    if isinstance(iat, int) and iat > now + 30:
        raise ValueError("token issued in the future")

    return payload


def install_portfolio_lock(
        app: FastAPI,
        expected_aud: str,
) -> None:

    @app.middleware("http")
    async def portfolio_lock(request: Request, call_next):
        if not PORTFOLIO_LOCK_ENABLED:
            return await call_next(request)

        if request.url.path in ALLOWED_PATHS:
            return await call_next(request)

        token = request.cookies.get("pf_embed_token")
        sid = request.cookies.get("pf_embed_sid")

        if not token or not sid:
            return PlainTextResponse(
                "This application is only available through the portfolio.",
                status_code=403,
            )

        try:
            payload = verify_token(token)

            if payload.get("aud") != expected_aud:
                raise ValueError("bad audience")

            if payload.get("sid") != sid:
                raise ValueError("bad sid")

        except Exception:
            return PlainTextResponse(
                "This application is only available through the portfolio.",
                status_code=403,
            )

        return await call_next(request)