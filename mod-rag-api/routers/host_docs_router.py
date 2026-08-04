# routers/host_docs_router.py
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
    default = here / "source_docs"
    return Path(os.getenv("SOURCE_DOCS_DIR", str(default))).expanduser().resolve()

def _host_dir(rag_host_id: int) -> Path:
    base = _source_docs_dir()
    return base / f"host_{int(rag_host_id)}"

def _safe_filename(name: str) -> str:
    # Keep only the name portion; prevent path tricks.
    return Path(name).name


router = APIRouter(prefix="/rag-hosts", tags=["host-docs"])


@router.get("/{rag_host_id}/docs/list")
async def list_host_docs(rag_host_id: int):
    d = _host_dir(rag_host_id)
    if not d.exists():
        return {"rag_host_id": int(rag_host_id), "files": []}

    if not d.is_dir():
        raise HTTPException(status_code=500, detail=f"Host docs path is not a directory: {d}")

    files = sorted([p.name for p in d.iterdir() if p.is_file()])
    return {"rag_host_id": int(rag_host_id), "files": files}


@router.post("/{rag_host_id}/docs/upload")
async def upload_host_docs(rag_host_id: int, files: List[UploadFile] = File(...)):
    if not files:
        return {"rag_host_id": int(rag_host_id), "saved": []}

    d = _host_dir(rag_host_id)
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

    return {"rag_host_id": int(rag_host_id), "saved": saved}
