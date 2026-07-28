from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

from bs4 import BeautifulSoup, NavigableString, Tag
import fitz  # PyMuPDF

SUPPORTED_EXTENSIONS = {'.txt', '.md', '.html', '.htm', '.pdf'}


@dataclass(frozen=True)
class ExtractedDocument:
    source_path: Path
    media_type: str
    text: str
    page_count: int | None = None


def _clean_lines(text: str) -> str:
    lines = [re.sub(r'[ \t]+', ' ', line).strip() for line in text.splitlines()]
    out: List[str] = []
    blank = False
    for line in lines:
        if not line:
            if out and not blank:
                out.append('')
            blank = True
            continue
        out.append(line)
        blank = False
    return '\n'.join(out).strip()


def _table_to_blocks(table: Tag, table_number: int) -> str:
    rows: List[List[str]] = []
    for tr in table.find_all('tr'):
        cells = [
            _clean_lines(cell.get_text(' ', strip=True))
            for cell in tr.find_all(['th', 'td'])
        ]
        if any(cells):
            rows.append(cells)

    if not rows:
        return ''

    width = max(len(row) for row in rows)
    rows = [row + [''] * (width - len(row)) for row in rows]
    headers = rows[0]
    has_header = bool(table.find('th'))
    data_rows = rows[1:] if has_header else rows

    blocks = [f'Table {table_number}']
    if has_header:
        blocks.append('Columns: ' + ' | '.join(headers))

    for row_no, row in enumerate(data_rows, start=1):
        blocks.append(f'Row {row_no}:')
        for col_no, value in enumerate(row):
            if not value:
                continue
            label = headers[col_no] if has_header and headers[col_no] else f'Column {col_no + 1}'
            blocks.append(f'- {label}: {value}')
    return '\n'.join(blocks)


def extract_html(path: Path) -> ExtractedDocument:
    raw = path.read_text(encoding='utf-8', errors='replace')
    soup = BeautifulSoup(raw, 'lxml')

    for tag in soup(['script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'template']):
        tag.decompose()
    for selector in ('nav', 'footer', 'aside'):
        for tag in soup.find_all(selector):
            tag.decompose()

    table_blocks: List[str] = []
    for i, table in enumerate(soup.find_all('table'), start=1):
        block = _table_to_blocks(table, i)
        if block:
            marker = soup.new_tag('pre')
            marker.string = block
            table.replace_with(marker)
            table_blocks.append(block)

    parts: List[str] = []
    title = soup.title.get_text(' ', strip=True) if soup.title else ''
    if title:
        parts.append(f'Title: {title}')

    body = soup.body or soup
    for node in body.descendants:
        if not isinstance(node, Tag):
            continue
        if node.name in {'h1', 'h2', 'h3', 'h4', 'h5', 'h6'}:
            text = node.get_text(' ', strip=True)
            if text:
                parts.append(f"{'#' * int(node.name[1])} {text}")
        elif node.name == 'pre':
            text = node.get_text('\n', strip=True)
            if text:
                parts.append(text)
        elif node.name in {'p', 'li', 'dt', 'dd', 'blockquote'}:
            text = node.get_text(' ', strip=True)
            if text:
                prefix = '- ' if node.name == 'li' else ''
                parts.append(prefix + text)

    # Fallback for extremely simple/invalid HTML.
    if not parts:
        parts.append(body.get_text('\n', strip=True))

    return ExtractedDocument(path, 'text/html', _clean_lines('\n\n'.join(parts)))


def extract_pdf(path: Path) -> ExtractedDocument:
    pages: List[str] = []
    with fitz.open(path) as doc:
        for page_no, page in enumerate(doc, start=1):
            # blocks usually preserve reading order better than plain get_text().
            blocks = sorted(page.get_text('blocks'), key=lambda b: (round(b[1], 1), round(b[0], 1)))
            text = '\n'.join(str(block[4]).strip() for block in blocks if len(block) >= 5 and str(block[4]).strip())
            text = _clean_lines(text)
            if text:
                pages.append(f'## Page {page_no}\n\n{text}')
        page_count = len(doc)

    return ExtractedDocument(path, 'application/pdf', _clean_lines('\n\n'.join(pages)), page_count)


def extract_document(path: Path) -> ExtractedDocument:
    path = path.resolve()
    suffix = path.suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise ValueError(f'Unsupported document type: {suffix or "<none>"}')
    if suffix in {'.html', '.htm'}:
        return extract_html(path)
    if suffix == '.pdf':
        return extract_pdf(path)

    text = path.read_text(encoding='utf-8', errors='replace')
    media_type = 'text/markdown' if suffix == '.md' else 'text/plain'
    return ExtractedDocument(path, media_type, _clean_lines(text))


def discover_documents(folder: Path) -> List[Path]:
    return sorted(
        p for p in folder.rglob('*')
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS and '_normalized' not in p.parts
    )
