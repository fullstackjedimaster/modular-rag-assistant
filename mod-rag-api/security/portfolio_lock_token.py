# security/portfolio_lock_token.py

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any

PORTFOLIO_LOCK_SECRET = os.getenv("PORTFOLIO_LOCK_SECRET", "")

TOKEN_COOKIE = "pf_lock_token"
SESSION_COOKIE = "pf_lock_sid"

ALLOWED_TYP = {"JWT"}
ALLOWED_ALG = {"HS256"}

SKEW_SECONDS = 30
MIN_SECRET_LENGTH = 32


class PortfolioLockError(Exception):
    pass


def _b64url_decode(value: str) -> bytes:
    value = value.strip()
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _b64url_json(value: str) -> dict[str, Any]:
    return json.loads(_b64url_decode(value).decode("utf-8"))


def _secret() -> str:
    if not PORTFOLIO_LOCK_SECRET or len(PORTFOLIO_LOCK_SECRET) < MIN_SECRET_LENGTH:
        raise PortfolioLockError("PORTFOLIO_LOCK_SECRET is not configured securely")

    return PORTFOLIO_LOCK_SECRET


def verify_portfolio_lock_token(
    token: str,
    *,
    expected_aud: str,
    sid: str,
) -> dict[str, Any]:
    token = token.strip()
    sid = sid.strip()

    if not token:
        raise PortfolioLockError("missing portfolio lock token")

    if not sid:
        raise PortfolioLockError("missing portfolio lock session")

    parts = token.split(".")
    if len(parts) != 3:
        raise PortfolioLockError("invalid token format")

    header_b64, payload_b64, sig_b64 = parts

    try:
        header = _b64url_json(header_b64)
        payload = _b64url_json(payload_b64)
    except Exception as exc:
        raise PortfolioLockError("invalid token encoding") from exc

    if str(header.get("alg") or "") not in ALLOWED_ALG:
        raise PortfolioLockError("invalid token algorithm")

    if str(header.get("typ") or "") not in ALLOWED_TYP:
        raise PortfolioLockError("invalid token type")

    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")

    expected_sig = hmac.new(
        _secret().encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()

    actual_sig = _b64url_decode(sig_b64)

    if not hmac.compare_digest(expected_sig, actual_sig):
        raise PortfolioLockError("invalid token signature")

    if payload.get("aud") != expected_aud:
        raise PortfolioLockError("invalid token audience")

    now = int(time.time())

    exp = payload.get("exp")
    if not isinstance(exp, int):
        raise PortfolioLockError("invalid token exp")

    if now > exp + SKEW_SECONDS:
        raise PortfolioLockError("token expired")

    iat = payload.get("iat")
    if not isinstance(iat, int):
        raise PortfolioLockError("invalid token iat")

    if iat > now + SKEW_SECONDS:
        raise PortfolioLockError("token issued in the future")

    sid_claim = payload.get("sid")
    if not isinstance(sid_claim, str) or not sid_claim.strip():
        raise PortfolioLockError("missing token sid")

    if sid_claim.strip() != sid:
        raise PortfolioLockError("portfolio lock session mismatch")

    return payload