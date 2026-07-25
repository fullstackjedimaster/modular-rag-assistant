#!/usr/bin/env python3
"""
Multimodal PDF ingest (local-only):
- Parse text & figures from a PDF with PyMuPDF
- OCR figure text (axis labels, legends, annotations)
- (Optional) caption figures with a local HF model
- Build text & image embeddings (Sentence-Transformers / CLIP family)
- Store FAISS indexes + metadata for hybrid retrieval
"""

import os, json, re, uuid, math, shutil, argparse
from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Tuple

import fitz  # PyMuPDF
from PIL import Image
import pytesseract
import numpy as np

# Embeddings
from sentence_transformers import SentenceTransformer
import faiss

# Optional: local image captioning (disable with --no-captions)
from transformers import BlipProcessor, BlipForConditionalGeneration

# -------------- Config --------------

TEXT_EMBED_MODEL = "intfloat/e5-base"  # good local text embedder
IMG_EMBED_MODEL  = "clip-ViT-B-32"     # ST wrapper around CLIP

# Captioning model (local, auto-download once)
CAPTION_MODEL = "Salesforce/blip-image-captioning-base"

# Chunking
PARA_MAX_CHARS = 1200          # conservative chunk window
FIGURE_WINDOW_PARAS = 1        # attach fig to +/- this many paragraphs

# -------------- Data classes --------------

@dataclass
class Chunk:
    id: str
    doc_id: str
    page: int
    section: str
    text: str
    figure_ids: List[str]
    equations_tex: List[str]
    meta: Dict[str, Any]

@dataclass
class Figure:
    id: str
    doc_id: str
    page: int
    bbox: Tuple[float, float, float, float]
    path: str
    caption: str
    ocr_text: str
    caption_model: str

# -------------- Helpers --------------

def normspace(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()

def split_paragraphs(text: str) -> List[str]:
    # Simple splitter preserving paragraphs
    paras = re.split(r"\n\s*\n", text)
    paras = [normspace(p) for p in paras if normspace(p)]
    return paras

def chunk_text(paras: List[str], max_chars=PARA_MAX_CHARS) -> List[str]:
    chunks, buf = [], []
    cur = 0
    for p in paras:
        if cur + len(p) + 1 <= max_chars:
            buf.append(p)
            cur += len(p) + 1
        else:
            if buf:
                chunks.append("\n\n".join(buf))
            buf = [p]
            cur = len(p)
    if buf:
        chunks.append("\n\n".join(buf))
    return chunks

def extract_equations(text: str) -> List[str]:
    # catch LaTeX-y math or MathML-ish tokens if present
    eq = re.findall(r"(\$[^$]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))", text)
    return [normspace(x) for x in eq]

def save_pixmap_as_image(pix: fitz.Pixmap, out_path: str):
    if pix.n - pix.alpha < 4:
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    else:
        pix = fitz.Pixmap(fitz.csRGB, pix)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    img.save(out_path)

def ocr_image(path: str) -> str:
    try:
        im = Image.open(path)
        txt = pytesseract.image_to_string(im)
        return normspace(txt)
    except Exception as e:
        return ""

def is_probable_figure(img_name: str, w: int, h: int) -> bool:
    # Filter small icons; keep diagrams/charts/photos
    min_side = min(w, h)
    return min_side >= 64  # tune as needed

# -------------- Parse PDF --------------

def parse_pdf(pdf_path: str, out_dir: str, doc_id: str, enable_captions: bool=True) -> Tuple[List[Chunk], Dict[str, Figure]]:
    os.makedirs(out_dir, exist_ok=True)
    img_dir = os.path.join(out_dir, "images")
    os.makedirs(img_dir, exist_ok=True)

    doc = fitz.open(pdf_path)

    # Optional captioner
    caption_processor = None
    caption_model = None
    if enable_captions:
        caption_processor = BlipProcessor.from_pretrained(CAPTION_MODEL)
        caption_model = BlipForConditionalGeneration.from_pretrained(CAPTION_MODEL)

    all_chunks: List[Chunk] = []
    figures: Dict[str, Figure] = {}

    # Collect per-page paragraphs and candidate captions
    per_page_paras: Dict[int, List[str]] = {}
    per_page_captions: Dict[int, List[Tuple[str, fitz.Rect]]] = {}

    # First pass: text extraction (keep lines, look for "Figure x:" captions)
    for pi, page in enumerate(doc):
        page_text = page.get_text("text")
        paras = split_paragraphs(page_text)
        per_page_paras[pi] = paras

        # heuristic caption detection
        captions: List[Tuple[str, fitz.Rect]] = []
        for b in page.get_text("blocks"):
            # b = (x0, y0, x1, y1, "text", block_no, block_type, ...)
            if len(b) >= 5:
                rect = fitz.Rect(b[0], b[1], b[2], b[3])
                txt = normspace(b[4])
                if re.match(r"^(Figure|Fig\.?)\s*\d+[:.\- ]", txt, re.I):
                    captions.append((txt, rect))
        per_page_captions[pi] = captions

    # Second pass: figure extraction + OCR + captioning
    for pi, page in enumerate(doc):
        img_xrefs = page.get_images(full=True)
        for idx, img in enumerate(img_xrefs):
            xref = img[0]
            try:
                pix = fitz.Pixmap(doc, xref)
            except Exception:
                continue

            w, h = pix.width, pix.height
            if not is_probable_figure(f"img_{xref}", w, h):
                continue

            fig_id = f"fig-{pi+1}-{xref}"
            img_path = os.path.join(img_dir, f"{fig_id}.png")
            save_pixmap_as_image(pix, img_path)

            # Find a nearby caption block (lowest block below image bbox is ideal, but we lack bbox of image on page via get_images)
            # So, we fall back to text captions on page:
            candidate_caption = ""
            if per_page_captions[pi]:
                # crude heuristic: pick first caption on page if any
                candidate_caption = per_page_captions[pi][0][0]

            ocr_txt = ocr_image(img_path)

            gen_caption = ""
            cap_model_name = ""
            if enable_captions and caption_model is not None:
                try:
                    raw_img = Image.open(img_path).convert("RGB")
                    inputs = caption_processor(raw_img, return_tensors="pt")
                    out = caption_model.generate(**inputs, max_new_tokens=40)
                    gen_caption = caption_processor.decode(out[0], skip_special_tokens=True)
                    cap_model_name = CAPTION_MODEL
                except Exception:
                    gen_caption = ""

            figures[fig_id] = Figure(
                id=fig_id,
                doc_id=doc_id,
                page=pi+1,
                bbox=(0,0,0,0),  # not tracked via get_images; advanced layout requires xobject bbox tracing
                path=img_path,
                caption=candidate_caption or gen_caption,
                ocr_text=ocr_txt,
                caption_model=cap_model_name
            )

    # Third pass: build text chunks per page and attach nearby figure IDs
    for pi, paras in per_page_paras.items():
        # naive paragraph-to-chunking
        chunks = chunk_text(paras, max_chars=PARA_MAX_CHARS)
        for c in chunks:
            eqs = extract_equations(c)
            # naive association: attach all figures from same page (or tune with FIGURE_WINDOW_PARAS)
            page_fig_ids = [fid for fid, f in figures.items() if f.page == pi+1]
            ch = Chunk(
                id=str(uuid.uuid4()),
                doc_id=doc_id,
                page=pi+1,
                section="",  # could infer from heading levels via layout analysis
                text=c,
                figure_ids=page_fig_ids,
                equations_tex=eqs,
                meta={
                    "source": os.path.basename(pdf_path),
                    "page_label": pi+1
                }
            )
            all_chunks.append(ch)

    return all_chunks, figures

# -------------- Embeddings + FAISS --------------

def build_text_index(chunks: List[Chunk], out_dir: str, model_name: str = TEXT_EMBED_MODEL) -> str:
    model = SentenceTransformer(model_name)
    corpus = []
    meta = []
    for ch in chunks:
        # expand chunk: body + figure captions + OCR + equations gloss
        fig_txts = []
        for fid in ch.figure_ids:
            fig = ch.meta_store["figures"][fid] if "meta_store" in ch.meta else None

        # In this script we’ll fetch figure texts later; store only core text here.
        corpus.append(ch.text)
        meta.append(asdict(ch))

    embeddings = model.encode(corpus, normalize_embeddings=True, convert_to_numpy=True, batch_size=64)
    dim = embeddings.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(embeddings)

    faiss.write_index(index, os.path.join(out_dir, "text.index"))

    with open(os.path.join(out_dir, "text.meta.jsonl"), "w", encoding="utf-8") as f:
        for m in meta:
            f.write(json.dumps(m) + "\n")

    return model_name

def build_image_index(figures: Dict[str, Figure], out_dir: str, model_name: str = IMG_EMBED_MODEL) -> str:
    model = SentenceTransformer(model_name)
    paths = []
    meta = []
    for fid, fig in figures.items():
        paths.append(fig.path)
        meta.append(asdict(fig))

    if not paths:
        # no figures found → create empty placeholder index
        empty = faiss.IndexFlatIP(512)
        faiss.write_index(empty, os.path.join(out_dir, "image.index"))
        with open(os.path.join(out_dir, "image.meta.jsonl"), "w", encoding="utf-8") as f:
            pass
        return model_name

    embeddings = model.encode(paths, batch_size=16, convert_to_numpy=True, normalize_embeddings=True)
    dim = embeddings.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(embeddings)

    faiss.write_index(index, os.path.join(out_dir, "image.index"))
    with open(os.path.join(out_dir, "image.meta.jsonl"), "w", encoding="utf-8") as f:
        for m in meta:
            f.write(json.dumps(m) + "\n")

    return model_name

# -------------- Retrieval --------------

def load_meta(path: str) -> List[Dict[str, Any]]:
    out = []
    if not os.path.exists(path):
        return out
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                out.append(json.loads(line))
    return out

def search_hybrid(query: str, out_dir: str,
                  text_model_name: str = TEXT_EMBED_MODEL,
                  img_model_name: str = IMG_EMBED_MODEL,
                  k_text: int = 5, k_img: int = 5) -> Dict[str, Any]:

    # load indexes
    text_index_path = os.path.join(out_dir, "text.index")
    image_index_path = os.path.join(out_dir, "image.index")

    text_meta = load_meta(os.path.join(out_dir, "text.meta.jsonl"))
    image_meta = load_meta(os.path.join(out_dir, "image.meta.jsonl"))

    # embed query
    text_model = SentenceTransformer(text_model_name)
    qv_text = text_model.encode([query], normalize_embeddings=True, convert_to_numpy=True)

    # text search
    text_index = faiss.read_index(text_index_path)
    D_t, I_t = text_index.search(qv_text, min(k_text, len(text_meta)) if text_meta else 0)

    # image search (cross-modal via CLIP text encoder)
    img_model = SentenceTransformer(img_model_name)
    qv_img = img_model.encode([query], normalize_embeddings=True, convert_to_numpy=True)

    image_index = faiss.read_index(image_index_path)
    D_i, I_i = image_index.search(qv_img, min(k_img, len(image_meta)) if image_meta else 0)

    hits = {
        "text": [{"score": float(D_t[0][i]), "meta": text_meta[I_t[0][i]]} for i in range(len(I_t[0]))] if text_meta else [],
        "images": [{"score": float(D_i[0][i]), "meta": image_meta[I_i[0][i]]} for i in range(len(I_i[0]))] if image_meta else [],
    }
    return hits

# -------------- Main --------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True, help="Path to PDF")
    ap.add_argument("--out", default="out_pdf", help="Output folder")
    ap.add_argument("--doc-id", default=None, help="Doc ID (defaults to filename stem)")
    ap.add_argument("--no-captions", action="store_true", help="Disable local BLIP captioning")
    ap.add_argument("--demo-query", default=None, help="Run a demo hybrid search for this query")
    args = ap.parse_args()

    pdf_path = args.pdf
    out_dir = args.out
    doc_id = args.doc_id or os.path.splitext(os.path.basename(pdf_path))[0]

    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir, exist_ok=True)

    print("[1/4] Parsing PDF…")
    chunks, figures = parse_pdf(pdf_path, out_dir, doc_id, enable_captions=(not args.no_captions))

    # Store figures centrally so we can add into chunk meta if needed later
    # (Light linkage kept via figure_ids per chunk)
    with open(os.path.join(out_dir, "figures.json"), "w", encoding="utf-8") as f:
        json.dump({fid: asdict(fig) for fid, fig in figures.items()}, f, indent=2)

    # Build text index
    print("[2/4] Building text index…")
    text_model = build_text_index(chunks, out_dir, TEXT_EMBED_MODEL)

    # Build image index
    print("[3/4] Building image index…")
    img_model = build_image_index(figures, out_dir, IMG_EMBED_MODEL)

    # Save chunks
    print("[4/4] Saving chunk metadata…")
    with open(os.path.join(out_dir, "chunks.jsonl"), "w", encoding="utf-8") as f:
        for ch in chunks:
            f.write(json.dumps(asdict(ch)) + "\n")

    print(f"Done. Text model: {text_model} | Image model: {img_model}")
    print(f"Output in: {out_dir}")

    if args.demo_query:
        print("\n[DEMO] Hybrid search:", args.demo_query)
        hits = search_hybrid(args.demo_query, out_dir, TEXT_EMBED_MODEL, IMG_EMBED_MODEL, k_text=5, k_img=5)
        # Pretty-print top hits
        print("\nTop text hits:")
        for h in hits["text"]:
            print(f"  score={h['score']:.3f} page={h['meta']['page']} id={h['meta']['id']}")
            print("  ", (h["meta"]["text"][:240] + "…") if len(h["meta"]["text"]) > 240 else h["meta"]["text"])
        print("\nTop image hits:")
        for h in hits["images"]:
            m = h["meta"]
            print(f"  score={h['score']:.3f} page={m['page']} id={m['id']} file={m['path']}")
            cap = m.get("caption") or ""
            ocr = m.get("ocr_text") or ""
            preview = (cap or ocr)[:240]
            print("   ", preview)

if __name__ == "__main__":
    main()
