# routers/client_docs_router.py
from __future__ import annotations

import os
from pathlib import Path
from typing import List

from fastapi import APIRouter, HTTPException, UploadFile, File


def _p(p: str) -> Path:
    return Path(p).expanduser().resolve()

def _source_docs_dir() -> Path:
    # Mirror main.py behavior, but keep router self-contained.
    here = Path(__file__).parent.parent.resolve()  # /mod-rag-api
    config_dir =  str(here / "config")
    return  str(config_dir / "source_docs")

def _client_dir(rag_client_id: int) -> Path:
    base = _source_docs_dir()
    return base / f"client_{int(rag_client_id)}"

def _safe_filename(name: str) -> str:
    # Keep only the name portion; prevent path tricks.
    return Path(name).name


router = APIRouter(prefix="/rag-clients", tags=["client-docs"])


@router.get("/{rag_client_id}/docs/list")
async def list_client_docs(rag_client_id: int):
    d = _client_dir(rag_client_id)
    if not d.exists():
        return {"rag_client_id": int(rag_client_id), "files": []}

    if not d.is_dir():
        raise HTTPException(status_code=500, detail=f"Client docs path is not a directory: {d}")

    files = sorted([p.name for p in d.iterdir() if p.is_file()])
    return {"rag_client_id": int(rag_client_id), "files": files}


@router.post("/{rag_client_id}/docs/upload")
async def upload_client_docs(rag_client_id: int, files: List[UploadFile] = File(...)):
    if not files:
        return {"rag_client_id": int(rag_client_id), "saved": []}

    d = _client_dir(rag_client_id)
    d.mkdir(parents=True, exist_ok=True)

    saved: List[str] = []
    for uf in files:
        name = _safe_filename(uf.filename or "upload.bin")
        if not name:
            continue

        out_path = d / name

        # Read and write stream in one go (fine for typical doc sizes).
        # If you expect very large files, we can chunk-stream.
        data = await uf.read()
        out_path.write_bytes(data)
        saved.append(name)

    return {"rag_client_id": int(rag_client_id), "saved": saved}
