# PDF multimodal code status

`routers/pdf_multimodal_ingest.py` and `retrieve/app.py` use a separate stack:
FAISS, SentenceTransformers, CLIP, BLIP, OCR, and filesystem indexes.
The production Mod-RAG seeder uses Ollama embeddings and Qdrant.

Do not merge `retrieve/app.py` into `main.py` unless you intentionally want a second
retrieval backend. The new `document_ingest.py` extracts text from ordinary PDFs and
feeds that text into the existing Qdrant pipeline.

Known problems in the experimental script:

1. `build_text_index()` references `ch.meta_store`, which does not exist.
2. Figure captions/OCR are collected but never added to the text corpus.
3. `page.get_images()` does not give placement; every chunk on a page receives every image.
4. Repeated image XRefs can overwrite the same output filename.
5. BLIP, CLIP, OCR, and SentenceTransformers are loaded synchronously and are too heavy for a normal API request.
6. The empty image index assumes dimension 512 instead of reading the selected model dimension.
7. `retrieve/app.py` uses one global `INDEX_DIR`, not a collection or per-client index.
8. Static image mounting is decided at import time, so an index created later is not mounted automatically.

Treat that code as a later multimodal phase. For the portfolio proof of concept,
text extraction from PDFs plus HTML table normalization is the lower-risk path.
