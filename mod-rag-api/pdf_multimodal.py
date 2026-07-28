from __future__ import annotations

import base64
import json
import os
import re
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Literal

import fitz  # PyMuPDF
import httpx

AnalysisMode = Literal["all", "auto", "text_only"]


@dataclass
class PageResult:
    page_number: int
    native_text_chars: int
    image_count: int
    drawing_count: int
    vision_used: bool
    native_text: str = ""
    visual_analysis: str = ""
    warning: str | None = None


@dataclass
class PdfIngestResult:
    source_path: str
    page_count: int
    model: str | None
    mode: AnalysisMode
    normalized_markdown: str
    pages: list[PageResult] = field(default_factory=list)
    elapsed_seconds: float = 0.0

    def metadata(self) -> dict:
        data = asdict(self)
        data.pop("normalized_markdown", None)
        return data


def _clean(text: str) -> str:
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    out: list[str] = []
    previous_blank = False
    for line in lines:
        if not line:
            if out and not previous_blank:
                out.append("")
            previous_blank = True
        else:
            out.append(line)
            previous_blank = False
    return "\n".join(out).strip()


def _native_text(page: fitz.Page) -> str:
    blocks = page.get_text("blocks", sort=True)
    text = "\n".join(
        str(block[4]).strip()
        for block in blocks
        if len(block) >= 5 and str(block[4]).strip()
    )
    return _clean(text)


def _render_page_png(page: fitz.Page, dpi: int) -> bytes:
    # alpha=False reduces payload size and avoids transparent backgrounds.
    pix = page.get_pixmap(dpi=dpi, alpha=False)
    return pix.tobytes("png")


def _vision_prompt(page_number: int, native_text: str) -> str:
    native_excerpt = native_text[:6000]
    return f"""You are extracting knowledge from page {page_number} of a technical PDF for a retrieval-augmented generation system.

Inspect the ENTIRE page image. Return accurate Markdown only. Do not add facts that are not visible.

Capture all useful visual information that native PDF text extraction can miss:
1. Transcribe formulas exactly when legible, using plain text or LaTeX.
2. Convert tables into Markdown tables. Preserve headers, row labels, values, and units.
3. Describe charts with title, axes, legend, series, notable values, trends, and comparisons. Do not invent values.
4. Explain diagrams, arrows, relationships, workflows, schemas, and labels.
5. Transcribe important text inside images or scanned regions.
6. Include figure/table captions and connect them to the described object.
7. Mark uncertain material explicitly as [uncertain].
8. Do not repeat ordinary paragraph text unless needed to interpret a visual.

Native text already extracted from this page, supplied only to help align labels and avoid duplication:
---
{native_excerpt}
---

Use these headings only when applicable:
## Formulas
## Tables
## Charts and figures
## Diagram relationships
## OCR text
## Visual summary
"""


def _ollama_vision(image_png: bytes, page_number: int, native_text: str) -> str:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434").rstrip("/")
    model = os.getenv("OLLAMA_VISION_MODEL", "gemma3:4b")
    timeout = float(os.getenv("PDF_VISION_TIMEOUT_SECONDS", "300"))
    image_b64 = base64.b64encode(image_png).decode("ascii")

    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": _vision_prompt(page_number, native_text),
                "images": [image_b64],
            }
        ],
        "stream": False,
        "options": {
            "temperature": 0,
            "num_predict": int(os.getenv("PDF_VISION_MAX_TOKENS", "2200")),
        },
    }
    response = httpx.post(f"{base_url}/api/chat", json=payload, timeout=timeout)
    response.raise_for_status()
    body = response.json()
    content = body.get("message", {}).get("content")
    if not isinstance(content, str):
        raise RuntimeError(f"Unexpected Ollama vision response: {json.dumps(body)[:800]}")
    return _clean(content)


def _should_analyze(
    mode: AnalysisMode,
    native_chars: int,
    image_count: int,
    drawing_count: int,
) -> bool:
    if mode == "text_only":
        return False
    if mode == "all":
        return True
    threshold = int(os.getenv("PDF_NATIVE_TEXT_MIN_CHARS", "500"))
    return native_chars < threshold or image_count > 0 or drawing_count > 8


def extract_pdf_multimodal(
    path: Path,
    *,
    mode: AnalysisMode = "all",
    dpi: int | None = None,
    max_pages: int | None = None,
) -> PdfIngestResult:
    """Create one normalized Markdown document from native and visual PDF content.

    `all` analyzes every page visually. `auto` visually analyzes likely mixed/scanned
    pages. `text_only` disables vision and is mainly useful for diagnostics.
    """
    started = time.monotonic()
    path = path.expanduser().resolve()
    if path.suffix.lower() != ".pdf":
        raise ValueError("Multimodal PDF extraction requires a .pdf file")

    render_dpi = dpi or int(os.getenv("PDF_RENDER_DPI", "160"))
    model = None if mode == "text_only" else os.getenv("OLLAMA_VISION_MODEL", "gemma3:4b")
    page_results: list[PageResult] = []
    markdown: list[str] = [f"# {path.stem}", "", f"Source file: {path.name}"]

    with fitz.open(path) as doc:
        total_pages = len(doc)
        limit = total_pages if max_pages is None else min(total_pages, max_pages)

        for index in range(limit):
            page = doc[index]
            page_number = index + 1
            native = _native_text(page)
            image_count = len(page.get_images(full=True))
            try:
                drawing_count = len(page.get_drawings())
            except Exception:
                drawing_count = 0

            use_vision = _should_analyze(mode, len(native), image_count, drawing_count)
            visual = ""
            warning = None
            if use_vision:
                try:
                    visual = _ollama_vision(_render_page_png(page, render_dpi), page_number, native)
                except Exception as exc:
                    warning = f"Vision analysis failed: {type(exc).__name__}: {exc}"

            page_results.append(
                PageResult(
                    page_number=page_number,
                    native_text_chars=len(native),
                    image_count=image_count,
                    drawing_count=drawing_count,
                    vision_used=use_vision,
                    native_text=native,
                    visual_analysis=visual,
                    warning=warning,
                )
            )

            markdown.extend(["", f"# Page {page_number}"])
            if native:
                markdown.extend(["", "## Native text", "", native])
            if visual:
                markdown.extend(["", "## Visual extraction", "", visual])
            if warning:
                markdown.extend(["", f"> Warning: {warning}"])
            if not native and not visual:
                markdown.extend(["", "[No extractable content detected on this page.]"])

        if limit < total_pages:
            markdown.extend(["", f"> Processing stopped after {limit} of {total_pages} pages."])

    return PdfIngestResult(
        source_path=str(path),
        page_count=total_pages,
        model=model,
        mode=mode,
        normalized_markdown=_clean("\n".join(markdown)),
        pages=page_results,
        elapsed_seconds=round(time.monotonic() - started, 3),
    )
