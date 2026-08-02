# security/embed_lock.py

import os

from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse

from .embed_token import (
    SESSION_COOKIE,
    TOKEN_COOKIE,
    verify_embed_token,
)

EMBED_LOCK_ENABLED = (
    os.getenv("EMBED_LOCK_ENABLED", "false").lower() == "true"
)

ALLOWED_PATHS = {
    "/health",
}


def forbidden_response() -> PlainTextResponse:
    return PlainTextResponse(
        "This application is only available through the portfolio.",
        status_code=403,
    )


def install_embed_lock(
    app: FastAPI,
    expected_aud: str,
) -> None:
    @app.middleware("http")
    async def embed_lock(request: Request, call_next):
        if not EMBED_LOCK_ENABLED:
            return await call_next(request)

        if request.url.path in ALLOWED_PATHS:
            return await call_next(request)

        header_token = (request.headers.get("x-embed-token") or "").strip()
        cookie_token = (request.cookies.get(TOKEN_COOKIE) or "").strip()
        sid = (request.cookies.get(SESSION_COOKIE) or "").strip()

        try:
            if header_token:
                verify_embed_token(header_token, audience=expected_aud)
            else:
                verify_embed_token(
                    cookie_token,
                    audience=expected_aud,
                    sid=sid,
                    require_sid=True,
                )
        except Exception:
            return forbidden_response()

        return await call_next(request)