# cloud/apps/security/embed_token.py

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Callable

from fastapi import HTTPException, Request

EMBED_SECRET = os.getenv("EMBED_SECRET", "")

TOKEN_COOKIE = "pf_embed_token"
SESSION_COOKIE = "pf_embed_sid"
HEADER_TOKEN = "x-embed-token"

SKEW_SECONDS = 30
MIN_SECRET_LENGTH = 32


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value.strip() + padding)


def _b64url_json(value: str) -> dict[str, Any]:
    return json.loads(_b64url_decode(value).decode("utf-8"))


def _server_secret() -> str:
    if not EMBED_SECRET or len(EMBED_SECRET) < MIN_SECRET_LENGTH:
        raise HTTPException(status_code=500, detail="Server misconfigured: EMBED_SECRET")
    return EMBED_SECRET


def verify_embed_token(
        token: str,
        *,
        audience: str,
        sid: str = "",
        require_sid: bool = False,
) -> dict[str, Any]:
    secret = _server_secret()
    token = token.strip()
    sid = sid.strip()

    if not token:
        raise HTTPException(status_code=401, detail="Missing embed token")

    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="Invalid token format")

    header_b64, payload_b64, sig_b64 = parts

    try:
        header = _b64url_json(header_b64)
        payload = _b64url_json(payload_b64)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token encoding")

    if header.get("alg") != "HS256":
        raise HTTPException(status_code=401, detail="Invalid token alg")

    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    expected_sig = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    actual_sig = _b64url_decode(sig_b64)

    if not hmac.compare_digest(expected_sig, actual_sig):
        raise HTTPException(status_code=401, detail="Invalid token signature")

    if payload.get("aud") != audience:
        raise HTTPException(status_code=403, detail="Invalid token audience")

    now = int(time.time())

    exp = payload.get("exp")
    if not isinstance(exp, int) or now > exp + SKEW_SECONDS:
        raise HTTPException(status_code=401, detail="Token expired")

    iat = payload.get("iat")
    if not isinstance(iat, int) or iat > now + SKEW_SECONDS:
        raise HTTPException(status_code=401, detail="Invalid token iat")

    sid_claim = payload.get("sid")
    if not isinstance(sid_claim, str) or not sid_claim.strip():
        raise HTTPException(status_code=401, detail="Missing token sid")

    if require_sid and sid_claim.strip() != sid:
        raise HTTPException(status_code=403, detail="Session binding failed")

    return payload


def require_embed_token(audience: str) -> Callable[[Request], bool]:
    async def _dep(request: Request) -> bool:
        header_token = (request.headers.get(HEADER_TOKEN) or "").strip()
        cookie_token = (request.cookies.get(TOKEN_COOKIE) or "").strip()
        sid = (request.cookies.get(SESSION_COOKIE) or "").strip()

        if header_token:
            verify_embed_token(header_token, audience=audience)
        else:
            verify_embed_token(cookie_token, audience=audience, sid=sid, require_sid=True)

        return True

    return _dep