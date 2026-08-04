from __future__ import annotations

import json
import os
import shutil
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Query, UploadFile

from pdf_multimodal import AnalysisMode, extract_pdf_multimodal

router = APIRouter(prefix="/rag-hosts", tags=["pdf-multimodal-ingest"])
_WRITE_LOCK = threading.Lock()


def _source_docs_dir() -> Path:
    default = Path(__file__).resolve().parent.parent / "source_docs"
    return Path(os.getenv("SOURCE_DOCS_DIR", str(default))).expanduser().resolve()


def _safe_host_id(value: str) -> str:
    # Allows current UUID IDs and older integer demo IDs without permitting paths.
    cleaned = value.strip()
    if not cleaned or any(ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for ch in cleaned):
        raise HTTPException(status_code=400, detail="Invalid rag_host_id")
    return cleaned


def _host_dir(rag_host_id: str) -> Path:
    return _source_docs_dir() / f"host_{_safe_host_id(rag_host_id)}"


def _jobs_dir(rag_host_id: str) -> Path:
    return _host_dir(rag_host_id) / "_jobs"


def _job_path(rag_host_id: str, job_id: str) -> Path:
    return _jobs_dir(rag_host_id) / f"{job_id}.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_job(rag_host_id: str, job_id: str, data: dict) -> None:
    path = _job_path(rag_host_id, job_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    with _WRITE_LOCK:
        temp.write_text(json.dumps(data, indent=2), encoding="utf-8")
        temp.replace(path)


def _read_job(rag_host_id: str, job_id: str) -> dict:
    path = _job_path(rag_host_id, job_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Ingestion job not found")
    return json.loads(path.read_text(encoding="utf-8"))


def _run_job(
    rag_host_id: str,
    job_id: str,
    source_path: Path,
    mode: AnalysisMode,
    dpi: int,
    max_pages: int | None,
) -> None:
    job = _read_job(rag_host_id, job_id)
    job.update({"status": "running", "started_at": _now()})
    _write_job(rag_host_id, job_id, job)

    try:
        result = extract_pdf_multimodal(source_path, mode=mode, dpi=dpi, max_pages=max_pages)
        normalized_dir = _host_dir(rag_host_id) / "_normalized"
        normalized_dir.mkdir(parents=True, exist_ok=True)
        output_path = normalized_dir / f"{source_path.stem}.pdf.multimodal.md"
        output_path.write_text(result.normalized_markdown, encoding="utf-8")

        page_summary = [
            {
                "page_number": p.page_number,
                "native_text_chars": p.native_text_chars,
                "image_count": p.image_count,
                "drawing_count": p.drawing_count,
                "vision_used": p.vision_used,
                "warning": p.warning,
            }
            for p in result.pages
        ]
        job.update(
            {
                "status": "complete",
                "completed_at": _now(),
                "normalized_file": str(output_path.relative_to(_host_dir(rag_host_id))),
                "page_count": result.page_count,
                "mode": result.mode,
                "vision_model": result.model,
                "elapsed_seconds": result.elapsed_seconds,
                "pages": page_summary,
            }
        )
    except Exception as exc:
        job.update(
            {
                "status": "failed",
                "completed_at": _now(),
                "error": f"{type(exc).__name__}: {exc}",
            }
        )
    _write_job(rag_host_id, job_id, job)


@router.post("/{rag_host_id}/docs/pdf-multimodal", status_code=202)
async def ingest_pdf_multimodal(
    rag_host_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    mode: AnalysisMode = Query("all"),
    dpi: int = Query(160, ge=96, le=240),
    max_pages: int | None = Query(None, ge=1, le=1000),
):
    """Upload one PDF and start page-level native + vision extraction."""
    filename = Path(file.filename or "").name
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    host_dir = _host_dir(rag_host_id)
    host_dir.mkdir(parents=True, exist_ok=True)
    source_path = host_dir / filename
    with source_path.open("wb") as destination:
        while chunk := await file.read(1024 * 1024):
            destination.write(chunk)

    # Open once now so malformed/non-PDF uploads fail before a job is accepted.
    try:
        import fitz
        with fitz.open(source_path) as doc:
            if len(doc) == 0:
                raise ValueError("PDF contains no pages")
    except Exception as exc:
        source_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Invalid PDF: {exc}") from exc

    job_id = str(uuid.uuid4())
    job = {
        "job_id": job_id,
        "rag_host_id": rag_host_id,
        "status": "queued",
        "filename": filename,
        "mode": mode,
        "dpi": dpi,
        "max_pages": max_pages,
        "created_at": _now(),
    }
    _write_job(rag_host_id, job_id, job)
    background_tasks.add_task(_run_job, rag_host_id, job_id, source_path, mode, dpi, max_pages)
    return job


@router.get("/{rag_host_id}/docs/pdf-multimodal/jobs/{job_id}")
async def get_pdf_ingest_job(rag_host_id: str, job_id: str):
    return _read_job(rag_host_id, job_id)


@router.get("/{rag_host_id}/docs/pdf-multimodal/jobs")
async def list_pdf_ingest_jobs(rag_host_id: str):
    jobs_dir = _jobs_dir(rag_host_id)
    if not jobs_dir.exists():
        return {"rag_host_id": rag_host_id, "jobs": []}
    jobs = []
    for path in sorted(jobs_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            jobs.append(json.loads(path.read_text(encoding="utf-8")))
        except Exception:
            continue
    return {"rag_host_id": rag_host_id, "jobs": jobs}


@router.get("/{rag_host_id}/docs/pdf-multimodal/jobs/{job_id}/preview")
async def preview_pdf_ingest_job(
    rag_host_id: str,
    job_id: str,
    max_chars: int = Query(12000, ge=500, le=100000),
):
    job = _read_job(rag_host_id, job_id)
    if job.get("status") != "complete" or not job.get("normalized_file"):
        raise HTTPException(status_code=409, detail="Job is not complete")
    path = (_host_dir(rag_host_id) / job["normalized_file"]).resolve()
    base = _host_dir(rag_host_id).resolve()
    if base not in path.parents or not path.exists():
        raise HTTPException(status_code=404, detail="Normalized output not found")
    text = path.read_text(encoding="utf-8", errors="replace")
    return {
        "job_id": job_id,
        "normalized_file": job["normalized_file"],
        "characters": len(text),
        "truncated": len(text) > max_chars,
        "preview": text[:max_chars],
    }
