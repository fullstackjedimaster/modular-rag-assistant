# cloud/apps/security/embed_token.py
import os
import time
import json
import hmac
import base64
import hashlib
from typing import Callable
from settings import env

from fastapi import HTTPException, Request


EMBED_SECRET = env("EMBED_SECRET", "")
PORTFOLIO_LOCK_ENABLED = env("PORTFOLIO_LOCK_ENABLED", "true")

TOKEN_COOKIE = "pf_embed_token"
SESSION_COOKIE = "pf_embed_sid"

ALLOWED_TYP = {"JWT", "JWS", "EMBED"}
ALLOWED_ALG = {"HS256"}

SKEW_SECONDS = 30


def _b64url_decode(value: str) -> bytes:
    value = value.strip()
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _b64url_json(value: bytes) -> dict:
    return json.loads(value.decode("utf-8"))


def _verify_hs256(token: str, secret: str) -> dict:
    parts = token.split(".")

    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="Invalid token format")

    header_b64, payload_b64, sig_b64 = parts

    try:
        header = _b64url_json(_b64url_decode(header_b64))
        payload = _b64url_json(_b64url_decode(payload_b64))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token encoding")

    alg = str(header.get("alg") or "")
    typ = str(header.get("typ") or "")

    if alg not in ALLOWED_ALG:
        raise HTTPException(status_code=401, detail="Invalid token alg")

    if typ and typ not in ALLOWED_TYP:
        raise HTTPException(status_code=401, detail="Invalid token typ")

    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    expected_b64 = base64.urlsafe_b64encode(expected).decode("utf-8").rstrip("=")

    if not hmac.compare_digest(expected_b64, sig_b64):
        raise HTTPException(status_code=401, detail="Invalid token signature")

    return payload


def _extract_token(request: Request) -> str:
    token = (
        request.cookies.get(TOKEN_COOKIE)
        or request.headers.get("x-embed-token")
        or request.headers.get("X-Embed-Token")
        or ""
    ).strip()

    if token:
        return token

    auth = (request.headers.get("authorization") or request.headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()

    return ""



def require_embed_token(audience: str) -> Callable[[Request], bool]:
    async def _dep(request: Request) -> bool:
        if not PORTFOLIO_LOCK_ENABLED:
            return True
        if not EMBED_SECRET or len(EMBED_SECRET) < 32:
            raise HTTPException(status_code=500, detail="Server misconfigured: EMBED_SECRET")

        token = _extract_token(request)

        if not token:
            raise HTTPException(status_code=401, detail="Missing embed token")

        payload = _verify_hs256(token, EMBED_SECRET)

        if payload.get("aud") != audience:
            raise HTTPException(status_code=403, detail="Invalid token audience")

        now = int(time.time())

        exp = payload.get("exp")
        if not isinstance(exp, int):
            raise HTTPException(status_code=401, detail="Invalid token exp")

        if now > exp + SKEW_SECONDS:
            raise HTTPException(status_code=401, detail="Token expired")

        iat = payload.get("iat")
        if isinstance(iat, int) and iat > now + SKEW_SECONDS:
            raise HTTPException(status_code=401, detail="Invalid token iat")

        sid_claim = payload.get("sid")
        sid_cookie = request.cookies.get(SESSION_COOKIE, "")

        if not isinstance(sid_claim, str) or not sid_claim.strip():
            raise HTTPException(status_code=401, detail="Missing token sid")

        if not sid_cookie or not sid_cookie.strip():
            raise HTTPException(status_code=401, detail="Missing session cookie")

        if sid_cookie.strip() != sid_claim.strip():
            raise HTTPException(status_code=403, detail="Session binding failed")

        return True

    return _dep