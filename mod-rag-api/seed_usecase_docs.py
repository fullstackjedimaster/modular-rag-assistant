#!/usr/bin/env python3
"""
Seed a single usecase's documents into Qdrant using OLLAMA embeddings.

Usage:
    python scripts/seed_usecase_docs.py <usecase_id>

Required env vars:
- QDRANT_URL           (e.g. http://qdrant:6333)
- OLLAMA_BASE_URL      (e.g. http://ollama:11434)
- OLLAMA_EMBED_MODEL   (e.g. nomic-embed-text)
- EMBED_BATCH          (e.g. 64)

Optional env vars:
- CHUNK_SIZE_CHARS     (default: 1500)  [set it explicitly if you want; this script won't default silently]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

import httpx
from qdrant_client import QdrantClient
from qdrant_client.http.models import VectorParams, Distance, Batch


def _env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise SystemExit(f"[FATAL] Missing required env var: {name}")
    return v


def _env_int(name: str) -> int:
    v = _env(name)
    try:
        return int(v)
    except Exception:
        raise SystemExit(f"[FATAL] Env var {name} must be int, got: {v!r}")



EMBED_PROVIDER="ollama"
OLLAMA_EMBED_MODEL="nomic-embed-text"
EMBED_BATCH =16
CHUNK_SIZE_CHARS = 1000
CHUNK_OVERLAP_CHARS=200

# Internal service URLs (compose service names)
QDRANT_URL="http://qdrant:6333"
OLLAMA_BASE_URL="http://ollama:11434"


ROOT = Path(__file__).resolve().parents[1]




@dataclass
class UsecaseConfig:
    id: str
    collection: str
    source_dir: str


def load_usecase(uc_id: str) -> UsecaseConfig:

    collection = uc.get("collection")
    if not collection:
        raise SystemExit(f"usecase '{uc_id}' missing 'collection'")

    source_dir = uc.get("source_dir", uc_id)
    if not source_dir:
        raise SystemExit(f"usecase '{uc_id}' missing 'source_dir'")

    return UsecaseConfig(id=uc_id, collection=collection, source_dir=source_dir)


def discover_txt_files(folder: Path) -> List[Path]:
    files = sorted(Path(folder).glob("**/*.txt"))
    return [p for p in files if p.is_file()]


def read_texts(paths: List[Path]) -> List[Tuple[str, str]]:
    """
    Returns list of (doc_id, content)
    doc_id = stable UUIDv5 derived from path for idempotence across runs.
    """
    out: List[Tuple[str, str]] = []
    for p in paths:
        try:
            content = p.read_text(encoding="utf-8", errors="ignore").strip()
        except Exception:
            content = ""
        if not content:
            continue
        doc_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"file://{p.as_posix()}"))
        out.append((doc_id, content))
    return out


def simple_chunk(text: str, max_chars: int) -> List[str]:
    paras = [p.strip() for p in text.splitlines() if p.strip()]
    chunks: List[str] = []
    cur: List[str] = []
    cur_len = 0
    for p in paras:
        if cur_len + len(p) + 1 > max_chars and cur:
            chunks.append("\n".join(cur))
            cur, cur_len = [], 0
        cur.append(p)
        cur_len += len(p) + 1
    if cur:
        chunks.append("\n".join(cur))
    return chunks


def ollama_embed(texts: List[str]) -> List[List[float]]:
    base = OLLAMA_BASE_URL.rstrip("/")
    url = f"{base}/api/embed"
    payload = {"model": OLLAMA_EMBED_MODEL, "input": texts}

    with httpx.Client(timeout=120.0) as client:
        r = client.post(url, json=payload)
        if r.status_code >= 400:
            raise SystemExit(f"[FATAL] Ollama embed failed {r.status_code}: {r.text}")

    data = r.json()
    embs = data.get("embeddings")
    if not isinstance(embs, list) or not embs:
        raise SystemExit(f"[FATAL] Bad embed response: {data}")

    return [[float(v) for v in row] for row in embs]


def embed_dim() -> int:
    v = ollama_embed(["__dim_probe__"])[0]
    return int(len(v))


def recreate_collection(client: QdrantClient, name: str, vec_size: int):
    try:
        client.get_collection(name)
        exists = True
    except Exception:
        exists = False

    if exists:
        client.delete_collection(name)

    client.create_collection(
        collection_name=name,
        vectors_config=VectorParams(size=vec_size, distance=Distance.COSINE),
    )


def seed_usecase(uc:UsecaseConfig):
    src_folder = ROOT / uc.source_dir
    if not src_folder.exists():
        raise SystemExit(f"source folder not found: {src_folder}")

    txt_files = discover_txt_files(src_folder)
    if not txt_files:
        raise SystemExit(f"No .txt files under {src_folder}.")

    docs = read_texts(txt_files)

    print(f"[seed] Usecase: {uc.id}")
    print(f"[seed] Collection: {uc.collection}")
    print(f"[seed] Source dir: {src_folder}")
    print(f"[seed] Files: {len(txt_files)}")

    vec_dim = embed_dim()
    print(f"[seed] Ollama embed model: {OLLAMA_EMBED_MODEL}")
    print(f"[seed] Embed dim: {vec_dim}")

    client = QdrantClient(url=QDRANT_URL)

    print(f"[seed] Recreating collection '{uc.collection}' on {QDRANT_URL}")
    recreate_collection(client, uc.collection, vec_dim)

    points_ids: List[str] = []
    payloads: List[dict] = []
    vectors_all: List[List[float]] = []

    total_chunks = 0
    for doc_id, content in docs:
        chunks = simple_chunk(content, max_chars=CHUNK_SIZE_CHARS)
        if not chunks:
            continue
        total_chunks += len(chunks)

        for i in range(0, len(chunks), EMBED_BATCH):
            subset = chunks[i : i + EMBED_BATCH]
            vecs = ollama_embed(subset)

            for j, ch in enumerate(subset):
                pid = str(uuid.uuid5(uuid.UUID(doc_id), f"chunk-{i+j}"))
                points_ids.append(pid)
                payloads.append({"doc_id": doc_id, "text": ch, "source": str(src_folder)})
                vectors_all.append(vecs[j])

    print(f"[seed] Chunks total: {total_chunks}")
    print(f"[seed] Uploading {len(points_ids)} vectors to '{uc.collection}'")

    client.upsert(
        collection_name=uc.collection,
        points=Batch(ids=points_ids, vectors=vectors_all, payloads=payloads),
        wait=True,
    )

    print("[seed] Done.")


def main():


    collection = "mesh_daq_fault_docs"
    uc_id = str(uuid.uuid4())

    uc = UsecaseConfig(id=uc_id, collection=collection, source_dir="../source_docs")

    seed_usecase(uc)


if __name__ == "__main__":
    main()
