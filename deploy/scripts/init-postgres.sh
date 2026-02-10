#!/usr/bin/env bash
set -euo pipefail

# Runs the DDL in rag.sql against the Postgres container.
# Uses standard POSTGRES_* env vars (from ./env/postgres.env)

: "${POSTGRES_HOST:=postgres}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_DB:=rag}"
: "${POSTGRES_USER:=rag}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

export PGPASSWORD="$POSTGRES_PASSWORD"

echo "[init-postgres] waiting for postgres..."
for i in $(seq 1 60); do
  if pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "[init-postgres] applying rag.sql..."
psql \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -v ON_ERROR_STOP=1 \
  -f /deploy/scripts/rag.sql

echo "[init-postgres] done."
