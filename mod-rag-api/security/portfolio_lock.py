import os
from fastapi import Request
from fastapi.responses import PlainTextResponse

PORTFOLIO_LOCK_ENABLED = (
    os.getenv("PORTFOLIO_LOCK_ENABLED", "false").lower() == "true"
)

ALLOWED_PATHS = {
    "/health",
}

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

        if payload.get("aud") != "mesh-daq":
            raise ValueError("bad audience")

        if payload.get("sid") != sid:
            raise ValueError("bad sid")

    except Exception:
        return PlainTextResponse(
            "This application is only available through the portfolio.",
            status_code=403,
        )

    return await call_next(request)