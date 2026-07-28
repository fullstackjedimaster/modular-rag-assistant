#!/usr/bin/env python3
"""Seed TXT, Markdown, HTML, and text-based PDF documents into Qdrant."""
from __future__ import annotations

import argparse
import os
import uuid
from pathlib import Path
from typing import Iterable, List

import httpx
from qdrant_client import QdrantClient
from qdrant_client.http.models import Batch, Distance, VectorParams

from document_ingest import discover_documents, extract_document


def env(name: str, default: str | None = None, *, required: bool = False) -> str:
    value = os.getenv(name, default)
    if required and not value:
        raise SystemExit(f'[FATAL] Missing required environment variable: {name}')
    return value or ''


def env_int(name: str, default: int) -> int:
    raw = env(name, str(default))
    try:
        return int(raw)
    except ValueError as exc:
        raise SystemExit(f'[FATAL] {name} must be an integer, got {raw!r}') from exc


QDRANT_URL = env('QDRANT_URL', 'http://qdrant:6333')
OLLAMA_BASE_URL = env('OLLAMA_BASE_URL', 'http://ollama:11434')
OLLAMA_EMBED_MODEL = env('OLLAMA_EMBED_MODEL', 'nomic-embed-text')
EMBED_BATCH = env_int('EMBED_BATCH', 16)
CHUNK_SIZE_CHARS = env_int('CHUNK_SIZE_CHARS', 1200)
CHUNK_OVERLAP_CHARS = env_int('CHUNK_OVERLAP_CHARS', 180)


def chunk_text(text: str, max_chars: int, overlap_chars: int) -> List[str]:
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    chunks: List[str] = []
    current = ''

    for paragraph in paragraphs:
        candidate = f'{current}\n\n{paragraph}'.strip() if current else paragraph
        if len(candidate) <= max_chars:
            current = candidate
            continue

        if current:
            chunks.append(current)
            overlap = current[-overlap_chars:] if overlap_chars else ''
            current = f'{overlap}\n\n{paragraph}'.strip()
        else:
            # A single giant paragraph still needs deterministic splitting.
            step = max(1, max_chars - overlap_chars)
            chunks.extend(paragraph[i:i + max_chars] for i in range(0, len(paragraph), step))
            current = ''

    if current:
        chunks.append(current)
    return chunks


def ollama_embed(texts: List[str]) -> List[List[float]]:
    response = httpx.post(
        f'{OLLAMA_BASE_URL.rstrip("/")}/api/embed',
        json={'model': OLLAMA_EMBED_MODEL, 'input': texts},
        timeout=180.0,
    )
    response.raise_for_status()
    embeddings = response.json().get('embeddings')
    if not isinstance(embeddings, list) or len(embeddings) != len(texts):
        raise RuntimeError(f'Unexpected Ollama embedding response: {response.text[:500]}')
    return [[float(value) for value in row] for row in embeddings]


def ensure_collection(client: QdrantClient, collection: str, vector_size: int, recreate: bool) -> None:
    exists = client.collection_exists(collection)
    if exists and recreate:
        client.delete_collection(collection)
        exists = False
    if not exists:
        client.create_collection(
            collection_name=collection,
            vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
        )


def seed(source_dir: Path, collection: str, recreate: bool) -> None:
    paths = discover_documents(source_dir)
    if not paths:
        raise SystemExit(f'No supported documents found under {source_dir}')

    vector_size = len(ollama_embed(['dimension probe'])[0])
    client = QdrantClient(url=QDRANT_URL)
    ensure_collection(client, collection, vector_size, recreate)

    ids: List[str] = []
    vectors: List[List[float]] = []
    payloads: List[dict] = []

    for path in paths:
        extracted = extract_document(path)
        if not extracted.text:
            print(f'[skip] No extractable text: {path}')
            continue

        relative_source = str(path.relative_to(source_dir))
        doc_id = uuid.uuid5(uuid.NAMESPACE_URL, f'{collection}:{relative_source}')
        chunks = chunk_text(extracted.text, CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS)
        print(f'[extract] {relative_source}: {len(extracted.text)} chars, {len(chunks)} chunks')

        for batch_start in range(0, len(chunks), EMBED_BATCH):
            batch_chunks = chunks[batch_start:batch_start + EMBED_BATCH]
            batch_vectors = ollama_embed(batch_chunks)
            for offset, (chunk, vector) in enumerate(zip(batch_chunks, batch_vectors)):
                chunk_no = batch_start + offset
                ids.append(str(uuid.uuid5(doc_id, f'chunk-{chunk_no}')))
                vectors.append(vector)
                payloads.append({
                    'doc_id': str(doc_id),
                    'chunk_index': chunk_no,
                    'text': chunk,
                    'source': relative_source,
                    'media_type': extracted.media_type,
                    'page_count': extracted.page_count,
                })

    if not ids:
        raise SystemExit('No chunks were generated')

    for start in range(0, len(ids), 256):
        client.upsert(
            collection_name=collection,
            points=Batch(
                ids=ids[start:start + 256],
                vectors=vectors[start:start + 256],
                payloads=payloads[start:start + 256],
            ),
            wait=True,
        )
    print(f'[done] Upserted {len(ids)} chunks into {collection!r}')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', default=env('SOURCE_DOCS_DIR', str(Path(__file__).parent / 'source_docs')))
    parser.add_argument('--collection', required=True)
    parser.add_argument('--recreate', action='store_true', help='Delete and recreate the collection before seeding')
    args = parser.parse_args()
    seed(Path(args.source_dir).expanduser().resolve(), args.collection, args.recreate)


if __name__ == '__main__':
    main()
