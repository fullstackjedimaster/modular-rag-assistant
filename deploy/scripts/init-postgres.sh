#!/usr/bin/env bash
set -euo pipefail

log() { echo "[init-postgres] $*"; }

# --- use the SAME path you already had working ---
RAG_SQL_PATH="/deploy/scripts/rag.sql"   # <<< CHANGE ONLY IF YOUR OLD SCRIPT USED A DIFFERENT PATH

: "${POSTGRES_HOST:=postgres}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_DB:=rag}"
: "${POSTGRES_USER:=rag}"
: "${POSTGRES_PASSWORD:=rag}"

export PGPASSWORD="$POSTGRES_PASSWORD"

log "waiting for postgres..."
until pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1; do
  sleep 1
done

log "Hard resetting database ${POSTGRES_DB}..."

psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS "${POSTGRES_DB}";
CREATE DATABASE "${POSTGRES_DB}";
SQL

log "Applying rag.sql..."
psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$RAG_SQL_PATH"

log "Database reset complete."
