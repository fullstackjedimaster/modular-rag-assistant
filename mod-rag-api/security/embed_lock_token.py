# security/portfolio_lock_token.py

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any

EMBED_LOCK_SECRET = os.getenv("EMBED_LOCK_SECRET", "")

TOKEN_COOKIE = "pf_lock_token"
SESSION_COOKIE = "pf_lock_sid"

ALLOWED_TYP = {"JWT"}
ALLOWED_ALG = {"HS256"}

SKEW_SECONDS = 30
MIN_SECRET_LENGTH = 32


class EmbedLockError(Exception):
    pass


def _b64url_decode(value: str) -> bytes:
    value = value.strip()
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _b64url_json(value: str) -> dict[str, Any]:
    return json.loads(_b64url_decode(value).decode("utf-8"))


def _secret() -> str:
    if not EMBED_LOCK_SECRET or len(EMBED_LOCK_SECRET) < MIN_SECRET_LENGTH:
        raise EmbedLockError("EMBED_LOCK_SECRET is not configured securely")

    return EMBED_LOCK_SECRET


def verify_portfolio_lock_token(
    token: str,
    *,
    expected_aud: str,
    sid: str,
) -> dict[str, Any]:
    token = token.strip()
    sid = sid.strip()

    if not token:
        raise EmbedLockError("missing portfolio lock token")

    if not sid:
        raise EmbedLockError("missing portfolio lock session")

    parts = token.split(".")
    if len(parts) != 3:
        raise EmbedLockError("invalid token format")

    header_b64, payload_b64, sig_b64 = parts

    try:
        header = _b64url_json(header_b64)
        payload = _b64url_json(payload_b64)
    except Exception as exc:
        raise EmbedLockError("invalid token encoding") from exc

    if str(header.get("alg") or "") not in ALLOWED_ALG:
        raise EmbedLockError("invalid token algorithm")

    if str(header.get("typ") or "") not in ALLOWED_TYP:
        raise EmbedLockError("invalid token type")

    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")

    expected_sig = hmac.new(
        _secret().encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()

    actual_sig = _b64url_decode(sig_b64)

    if not hmac.compare_digest(expected_sig, actual_sig):
        raise EmbedLockError("invalid token signature")

    if payload.get("aud") != expected_aud:
        raise EmbedLockError("invalid token audience")

    now = int(time.time())

    exp = payload.get("exp")
    if not isinstance(exp, int):
        raise EmbedLockError("invalid token exp")

    if now > exp + SKEW_SECONDS:
        raise EmbedLockError("token expired")

    iat = payload.get("iat")
    if not isinstance(iat, int):
        raise EmbedLockError("invalid token iat")

    if iat > now + SKEW_SECONDS:
        raise EmbedLockError("token issued in the future")

    sid_claim = payload.get("sid")
    if not isinstance(sid_claim, str) or not sid_claim.strip():
        raise EmbedLockError("missing token sid")

    if sid_claim.strip() != sid:
        raise EmbedLockError("portfolio lock session mismatch")

    return payload