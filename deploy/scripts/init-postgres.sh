#!/usr/bin/env bash
set -euo pipefail

# deploy/scripts/init-postgres.sh
# Hard reset: DROP DATABASE + CREATE DATABASE + apply rag.sql
# rag.sql is expected to be in the same directory as this script.

log() { echo -e "\033[1;32m[init-postgres] $*\033[0m"; }
err() { echo -e "\033[1;31m[init-postgres] $*\033[0m" >&2; exit 1; }

DATABASE_URL="${DATABASE_URL:-}"
POSTGRES_HOST="${POSTGRES_HOST:-${DATABASE_HOST:-}}"
POSTGRES_PORT="${POSTGRES_PORT:-${DATABASE_PORT:-5432}}"
POSTGRES_DB="${POSTGRES_DB:-}"
POSTGRES_USER="${POSTGRES_USER:-}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"

if [ -z "$DATABASE_URL" ]; then
  : "${POSTGRES_HOST:?POSTGRES_HOST is required}"
  : "${POSTGRES_PORT:?POSTGRES_PORT ) is required}"
  : "${POSTGRES_DB:?POSTGRES_DB is required}"
  : "${POSTGRES_USER:?POSTGRES_USER is required}"
  : "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

  export PGPASSWORD="$POSTGRES_PASSWORD"

  DATABASE_URL="postgresql://${POSTGRES_USER}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
fi

SITE_NAME="${SITE_NAME:-TEST}"
SITEARRAY_LABEL="${SITEARRAY_LABEL:-Site Array TEST}"
TZ_NAME="${TZ_NAME:-America/Chicago}"

echo "[init-postgres] Using DB host='${POSTGRES_HOST:-<from DATABASE_URL>}' db='${POSTGRES_DB:-<from DATABASE_URL>}' user='${POSTGRES_USER:-<from DATABASE_URL>}'"
echo "[init-postgres] Waiting for Postgres and checking schema..."

i=1
while [ "$i" -le 60 ]; do
  out="$(psql "$DATABASE_URL" -tA -c "SELECT 1 FROM pg_namespace WHERE nspname='rag' LIMIT 1;" 2>/dev/null || true)"
  out="$(echo "$out" | tr -d '[:space:]')"

if [ "$out" = "1" ]; then
  echo "[init-postgres] Postgres is ready. Schema 'ss' already exists. Skipping (only runs on fresh DB)."
  exit 0
fi # Distinguish "psql failed (not ready)" from "ready but schema missing"
 if psql "$DATABASE_URL" -tAc "SELECT 1" >/dev/null 2>&1; then
   echo "[init-postgres] Postgres is ready. Schema 'ss' not found; proceeding with initialization."
   break
fi

echo "[init-postgres] Not ready yet ($i/60); sleeping 1s..."
sleep 1
i=$((i + 1))
done

# Final hard fail if Postgres never came up
if ! psql "$DATABASE_URL" -tAc "SELECT 1" >/dev/null 2>&1; then
  echo "[init-postgres] ERROR: Postgres never became ready."
  exit 1
fi

echo "[init-postgres] Creating schema/tables and seeding data..."

psql -v ON_ERROR_STOP=1 "$DATABASE_URL" <<SQL
BEGIN;

CREATE SCHEMA IF NOT EXISTS rag;

SET search_path TO rag;

#### insert rag.sql here

COMMIT;

SQL

echo "[init-postgres] Done."
