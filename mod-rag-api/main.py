#!/usr/bin/env python3
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles

from routers.db import init_db_pool, close_db_pool

# ✅ your main rag host API (keep ONLY the /rag-hosts version)
from routers.routes_rag_hosts import router as rag_hosts_router  # adjust import if needed
from routers.host_docs_router import router as host_docs_router
from routers.document_ingest_router import router as document_ingest_router
from routers.pdf_multimodal_router import router as pdf_multimodal_router

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


# ✅ primary DB-backed host_context API
app.include_router(rag_hosts_router)

app.include_router(host_docs_router)
app.include_router(document_ingest_router)
app.include_router(pdf_multimodal_router)

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
