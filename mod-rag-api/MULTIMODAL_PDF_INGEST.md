# Multimodal PDF ingestion

## Goal

Produce one normalized Markdown knowledge document per PDF by combining:

1. native PDF text,
2. scanned/image text recognized by a vision model,
3. formulas transcribed into text or LaTeX,
4. tables reconstructed as Markdown,
5. chart and diagram descriptions,
6. captions, labels, relationships, units, and qualified uncertainty.

The normalized Markdown then follows the existing chunk → Ollama embedding → Qdrant path.

## Why page rendering is used

Extracting only embedded images misses vector charts, vector formulas, lines, arrows, and page-level relationships. Each PDF page is therefore rendered to PNG and supplied to an Ollama vision model. Native text is extracted separately and included as alignment context.

## Modes

- `all`: visually inspect every page. Best quality; slowest. This is the default.
- `auto`: visually inspect pages with little native text, embedded images, or substantial vector drawing content.
- `text_only`: native extraction only; useful for comparison and diagnostics.

## Required Ollama model

Pull a vision-capable model available to your Ollama installation. The default configuration uses:

```bash
ollama pull gemma3:4b
```

Configure the API container:

```env
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_VISION_MODEL=gemma3:4b
PDF_RENDER_DPI=160
PDF_VISION_TIMEOUT_SECONDS=300
PDF_VISION_MAX_TOKENS=2200
```

The Ollama REST vision API accepts base64 images in the message `images` array.

## Routes

### Start an ingestion job

```http
POST /rag-clients/{rag_client_id}/docs/pdf-multimodal
Content-Type: multipart/form-data
```

Query parameters:

- `mode=all|auto|text_only`
- `dpi=96..240`
- `max_pages=1..1000` (optional)

Example:

```bash
curl -X POST \
  'http://localhost:8002/rag-clients/CLIENT_ID/docs/pdf-multimodal?mode=all&dpi=160' \
  -F 'file=@database-design.pdf'
```

The response is HTTP 202 and contains a `job_id`.

### Read job status

```bash
curl 'http://localhost:8002/rag-clients/CLIENT_ID/docs/pdf-multimodal/jobs/JOB_ID'
```

Statuses are `queued`, `running`, `complete`, or `failed`.

### List jobs

```bash
curl 'http://localhost:8002/rag-clients/CLIENT_ID/docs/pdf-multimodal/jobs'
```

### Preview normalized output

```bash
curl 'http://localhost:8002/rag-clients/CLIENT_ID/docs/pdf-multimodal/jobs/JOB_ID/preview'
```

## Output location

Original PDF:

```text
source_docs/client_<rag_client_id>/<filename>.pdf
```

Normalized Markdown:

```text
source_docs/client_<rag_client_id>/_normalized/<filename>.pdf.multimodal.md
```

Persistent job state:

```text
source_docs/client_<rag_client_id>/_jobs/<job_id>.json
```

## Seeding into Qdrant

Seed the normalized Markdown, not both the PDF and normalized derivative, or the content will be duplicated. The current document discovery excludes `_normalized`; therefore either:

1. point the seeder directly at the `_normalized` directory, or
2. add a route/job that seeds a selected normalized file.

Example:

```bash
python seed_usecase_docs.py \
  --source-dir source_docs/client_CLIENT_ID/_normalized \
  --collection entity_client_docs
```

For a production version, the next step is a persistent queue such as Redis/RQ, Celery, Dramatiq, or an application jobs table. FastAPI `BackgroundTasks` is appropriate for the portfolio proof of concept, but a process restart interrupts an active job.

## Quality controls

- Vision temperature is set to zero.
- The prompt prohibits invented values and requires `[uncertain]` labels.
- Native and visual extraction are retained as separate sections.
- Per-page warnings are saved in job metadata.
- A preview route allows inspection before embedding.

## Known limits

- Complex multi-page tables may need post-processing across page boundaries.
- Tiny chart labels may require a higher `dpi`, at greater latency and memory cost.
- Vision models can still misread formulas and numerical chart values. Keep source/page metadata so answers can cite the original page.
- Password-protected PDFs are rejected unless opened with a password-aware extension added later.
