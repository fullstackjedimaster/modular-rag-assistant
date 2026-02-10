#!/usr/bin/env bash
set -euo pipefail

# Runs the DDL in rag.sql against the Postgres container.
# Hard-resets the DB each time: DROP DATABASE + CREATE DATABASE + apply rag.sql.

log() { echo "[init-postgres] $*"; }

: "${POSTGRES_HOST:=postgres}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_DB:=rag}"
: "${POSTGRES_USER:=rag}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

export PGPASSWORD="$POSTGRES_PASSWORD"

# Resolve rag.sql relative to THIS script location (no assumptions about /deploy paths)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAG_SQL="${SCRIPT_DIR}/rag.sql"

if [[ ! -f "$RAG_SQL" ]]; then
  echo "[init-postgres] ERROR: rag.sql not found at: $RAG_SQL" >&2
  echo "[init-postgres] Contents of $SCRIPT_DIR:" >&2
  ls -la "$SCRIPT_DIR" >&2 || true
  exit 1
fi

log "waiting for postgres at ${POSTGRES_HOST}:${POSTGRES_PORT}..."
for i in $(seq 1 60); do
  if pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

log "hard resetting database '${POSTGRES_DB}'..."
psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS "${POSTGRES_DB}";
CREATE DATABASE "${POSTGRES_DB}";
SQL

log "applying rag.sql from: $RAG_SQL"
psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f "$RAG_SQL"

log "done."
