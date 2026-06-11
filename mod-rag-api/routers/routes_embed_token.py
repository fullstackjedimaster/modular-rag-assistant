from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/embed-token", tags=["embed-token"])

EMBED_SECRET = os.getenv("EMBED_SECRET", "")

ALLOWED_TARGETS = {
    "iot-wireless-mesh-daq",
}


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def sign(payload: Dict[str, Any]) -> str:
    if not EMBED_SECRET or len(EMBED_SECRET) < 32:
        raise HTTPException(status_code=500, detail="server misconfigured")

    header = {
        "alg": "HS256",
        "typ": "JWT",
    }

    header_b64 = b64url(
        json.dumps(header, separators=(",", ":")).encode("utf-8")
    )

    body_b64 = b64url(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    )

    signing_input = f"{header_b64}.{body_b64}".encode("utf-8")

    sig = hmac.new(
        EMBED_SECRET.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()

    sig_b64 = b64url(sig)

    return f"{header_b64}.{body_b64}.{sig_b64}"


@router.get("")
async def get_embed_token(
    target: str = Query(default=""),
) -> Dict[str, str]:
    if target not in ALLOWED_TARGETS:
        raise HTTPException(status_code=400, detail="bad request")

    now = int(time.time())

    token = sign(
        {
            "iss": "modular-rag-assistant.fullstackjedi.dev",
            "aud": target,
            "sid": str(uuid.uuid4()),
            "iat": now,
            "exp": now + 180,
            "jti": str(uuid.uuid4()),
        }
    )

    return {"token": token}