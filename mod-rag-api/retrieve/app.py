#!/usr/bin/env python3
import os
import json
from typing import List, Dict, Any, Optional

import faiss
import numpy as np
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

# ---------------- Config ----------------

INDEX_DIR = os.getenv("INDEX_DIR", "pv_faults_out")  # folder created by pdf_multimodal_ingest.py
TEXT_INDEX_PATH = os.path.join(INDEX_DIR, "text.index")
TEXT_META_PATH  = os.path.join(INDEX_DIR, "text.meta.jsonl")
IMAGE_INDEX_PATH = os.path.join(INDEX_DIR, "image.index")
IMAGE_META_PATH  = os.path.join(INDEX_DIR, "image.meta.jsonl")
FIGURES_JSON_PATH = os.path.join(INDEX_DIR, "figures.json")  # optional

# same models used during ingest
TEXT_MODEL_NAME = os.getenv("TEXT_MODEL_NAME", "intfloat/e5-base")
IMG_MODEL_NAME  = os.getenv("IMG_MODEL_NAME", "clip-ViT-B-32")

IMAGES_DIR = os.path.join(INDEX_DIR, "images")  # where figure PNGs are stored

# ---------------- App ----------------

app = FastAPI(title="Local Hybrid PDF Retriever", version="1.0.0")

# enable CORS for your UI origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ALLOW_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# serve figure thumbnails
if os.path.isdir(IMAGES_DIR):
    app.mount("/images", StaticFiles(directory=IMAGES_DIR), name="images")

# ---------------- Models / state ----------------

class Hit(BaseModel):
    score: float
    page: Optional[int] = None
    id: Optional[str] = None
    text: Optional[str] = None
    doc_id: Optional[str] = None
    section: Optional[str] = None
    figure_ids: Optional[List[str]] = None
    equations_tex: Optional[List[str]] = None
    source: Optional[str] = None
    # image-specific
    image_path: Optional[str] = None
    caption: Optional[str] = None
    ocr_text: Optional[str] = None
    thumbnail_url: Optional[str] = None

class SearchResponse(BaseModel):
    query: str
    text_hits: List[Hit]
    image_hits: List[Hit]

# lazy-loaded globals
_text_index = None
_text_meta: List[Dict[str, Any]] = []
_image_index = None
_image_meta: List[Dict[str, Any]] = []
_text_model: Optional[SentenceTransformer] = None
_img_model: Optional[SentenceTransformer] = None

def _load_meta_jsonl(path: str) -> List[Dict[str, Any]]:
    out = []
    if not os.path.exists(path):
        return out
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out

def _ensure_loaded():
    global _text_index, _image_index, _text_meta, _image_meta, _text_model, _img_model

    if _text_model is None:
        _text_model = SentenceTransformer(TEXT_MODEL_NAME)
    if _img_model is None:
        _img_model = SentenceTransformer(IMG_MODEL_NAME)

    if _text_index is None:
        if not os.path.exists(TEXT_INDEX_PATH):
            raise RuntimeError(f"Missing text index at {TEXT_INDEX_PATH}")
        _text_index = faiss.read_index(TEXT_INDEX_PATH)
        _text_meta = _load_meta_jsonl(TEXT_META_PATH)

    if _image_index is None:
        # image index may be empty but present
        if not os.path.exists(IMAGE_INDEX_PATH):
            raise RuntimeError(f"Missing image index at {IMAGE_INDEX_PATH}")
        _image_index = faiss.read_index(IMAGE_INDEX_PATH)
        _image_meta = _load_meta_jsonl(IMAGE_META_PATH)

def _search_text(query: str, top_k: int) -> List[Hit]:
    if not _text_meta:
        return []
    qv = _text_model.encode([query], normalize_embeddings=True, convert_to_numpy=True)
    D, I = _text_index.search(qv, min(top_k, len(_text_meta)))
    out: List[Hit] = []
    for i in range(len(I[0])):
        meta = _text_meta[I[0][i]]
        text_preview = meta.get("text", "")
        if len(text_preview) > 600:
            text_preview = text_preview[:600] + "…"
        out.append(Hit(
            score=float(D[0][i]),
            page=meta.get("page"),
            id=meta.get("id"),
            text=text_preview,
            doc_id=meta.get("doc_id"),
            section=meta.get("section"),
            figure_ids=meta.get("figure_ids"),
            equations_tex=meta.get("equations_tex"),
            source=(meta.get("meta") or {}).get("source")
        ))
    return out

def _search_images(query: str, top_k: int) -> List[Hit]:
    if not _image_meta:
        return []
    qv = _img_model.encode([query], normalize_embeddings=True, convert_to_numpy=True)
    D, I = _image_index.search(qv, min(top_k, len(_image_meta)))
    out: List[Hit] = []
    for i in range(len(I[0])):
        meta = _image_meta[I[0][i]]
        img_path = meta.get("path", "")
        filename = os.path.basename(img_path) if img_path else ""
        thumb_url = f"/images/{filename}" if filename else None
        cap = meta.get("caption") or ""
        ocr = meta.get("ocr_text") or ""
        preview = cap or ocr
        if len(preview) > 300:
            preview = preview[:300] + "…"
        out.append(Hit(
            score=float(D[0][i]),
            page=meta.get("page"),
            id=meta.get("id"),
            doc_id=meta.get("doc_id"),
            caption=cap,
            ocr_text=ocr,
            image_path=img_path,
            thumbnail_url=thumb_url,
            source=os.path.basename(meta.get("doc_id", "")) or None
        ))
    return out

@app.get("/healthz")
def health():
    return {"ok": True, "index_dir": INDEX_DIR}

@app.get("/search", response_model=SearchResponse)
def search(q: str = Query(..., min_length=1),
           k_text: int = Query(5, ge=0, le=50),
           k_images: int = Query(5, ge=0, le=50)) -> SearchResponse:
    try:
        _ensure_loaded()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    text_hits = _search_text(q, k_text)
    image_hits = _search_images(q, k_images)

    return SearchResponse(query=q, text_hits=text_hits, image_hits=image_hits)
