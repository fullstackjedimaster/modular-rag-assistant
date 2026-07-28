from __future__ import annotations

import shutil
from pathlib import Path
from typing import List

from fastapi import APIRouter, File, HTTPException, UploadFile

from document_ingest import SUPPORTED_EXTENSIONS, extract_document

router = APIRouter(prefix='/rag-clients', tags=['document-ingest'])


def source_docs_dir() -> Path:
    default = Path(__file__).resolve().parent.parent / 'source_docs'
    from os import getenv
    return Path(getenv('SOURCE_DOCS_DIR', str(default))).expanduser().resolve()


def client_dir(rag_client_id: int) -> Path:
    return source_docs_dir() / f'client_{rag_client_id}'


def safe_name(name: str) -> str:
    return Path(name).name


@router.post('/{rag_client_id}/docs/ingest')
async def ingest_documents(rag_client_id: int, files: List[UploadFile] = File(...)):
    """Save originals and produce normalized UTF-8 text for preview/seeding.

    This route performs extraction and normalization only. It deliberately does
    not rebuild the Qdrant collection inside the HTTP request; run the seeder or
    a background job after uploads are complete.
    """
    if not files:
        raise HTTPException(status_code=400, detail='No files supplied')

    original_dir = client_dir(rag_client_id)
    normalized_dir = original_dir / '_normalized'
    original_dir.mkdir(parents=True, exist_ok=True)
    normalized_dir.mkdir(parents=True, exist_ok=True)

    results = []
    for upload in files:
        filename = safe_name(upload.filename or '')
        suffix = Path(filename).suffix.lower()
        if not filename or suffix not in SUPPORTED_EXTENSIONS:
            results.append({'filename': filename or None, 'ok': False, 'error': f'Unsupported type: {suffix}'})
            continue

        destination = original_dir / filename
        try:
            with destination.open('wb') as out:
                while chunk := await upload.read(1024 * 1024):
                    out.write(chunk)

            extracted = extract_document(destination)
            normalized_name = f'{destination.stem}.{suffix.lstrip(".")}.normalized.md'
            normalized_path = normalized_dir / normalized_name
            normalized_path.write_text(extracted.text, encoding='utf-8')

            results.append({
                'filename': filename,
                'ok': True,
                'media_type': extracted.media_type,
                'characters': len(extracted.text),
                'page_count': extracted.page_count,
                'normalized_file': str(normalized_path.relative_to(original_dir)),
            })
        except Exception as exc:
            destination.unlink(missing_ok=True)
            results.append({'filename': filename, 'ok': False, 'error': str(exc)})

    return {'rag_client_id': rag_client_id, 'documents': results}
