# RAG Host route/database reconciliation

The management UI now uses the RAG Host terminology consistently. The API routes and PostgreSQL function signatures have been reconciled.

## Apply the database migration first

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f deploy/scripts/20260804_rag_host_route_support.sql
```

If PostgreSQL runs in Compose, use the database service instead, for example:

```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v ON_ERROR_STOP=1 \
  < scripts/20260804_rag_host_route_support.sql
```

Then rebuild/restart `mod-rag-api` and `mod-rag`.

## Corrected endpoints

- `GET /api/rag-hosts/{host_id}/content-docs`
- `POST /api/rag-hosts/{host_id}/content-docs`
- `PUT /api/rag-hosts/{host_id}/content-docs/{doc_id}`
- `DELETE /api/rag-hosts/{host_id}/content-docs/{doc_id}`
- `GET /api/rag-hosts/{host_id}/context-messages`
- `PUT /api/rag-hosts/{host_id}/context-messages`
- `GET /api/rag-hosts/{host_id}/system-prompt`
- `PUT /api/rag-hosts/{host_id}/system-prompt`
- Full host CRUD and runtime status routes

`context-messages` is a UI-facing alias over `rag.telemetry_message`; it is no longer a copy of the content-document UI.
