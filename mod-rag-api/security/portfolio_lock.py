# security/portfolio_lock.py

import os

from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse

from .embed_token import (
    SESSION_COOKIE,
    TOKEN_COOKIE,
    verify_embed_token,
)

PORTFOLIO_LOCK_ENABLED = (
    os.getenv("PORTFOLIO_LOCK_ENABLED", "false").lower() == "true"
)

ALLOWED_PATHS = {
    "/health",
}


def forbidden_response() -> PlainTextResponse:
    return PlainTextResponse(
        "This application is only available through the portfolio.",
        status_code=403,
    )


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

        token = request.cookies.get(TOKEN_COOKIE, "")
        sid = request.cookies.get(SESSION_COOKIE, "")

        try:
            verify_embed_token(
                token,
                audience=expected_aud,
                sid=sid,
            )
        except Exception:
            return forbidden_response()

        return await call_next(request)