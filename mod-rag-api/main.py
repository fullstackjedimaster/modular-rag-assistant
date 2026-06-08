#!/usr/bin/env python3
from __future__ import annotations
from security.embed_lock import install_embed_lock

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles

from routers.db import init_db_pool, close_db_pool

# ✅ your main rag client API (keep ONLY the /rag-clients version)
from routers.routes_rag_clients import router as rag_clients_router  # adjust import if needed
from routers.client_docs_router import router as client_docs_router

try:
    from routers.embed_context_router import build_embed_context_router  # type: ignore
except Exception:
    build_embed_context_router = None  # type: ignore


def _p(p: str) -> Path:
    return Path(p).expanduser().resolve()


HERE = Path(__file__).parent.resolve()


app = FastAPI(title="Mod RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# install_portfolio_lock(
#     app,
#     expected_aud="modular-rag-assistant",
# )
# ✅ primary DB-backed client_context API
app.include_router(rag_clients_router)

app.include_router(client_docs_router)

# ✅ embed/context router (nginx strips /api/ already)
if build_embed_context_router:
    app.include_router(build_embed_context_router())


@app.get("/health", response_class=PlainTextResponse)
def health() -> str:
    return "ok"


@app.on_event("startup")
async def _startup() -> None:
    await init_db_pool(app)


@app.on_event("shutdown")
async def _shutdown() -> None:
    await close_db_pool(app)
