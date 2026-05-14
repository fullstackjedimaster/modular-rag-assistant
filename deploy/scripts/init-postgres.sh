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


SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Prefer deploy/scripts/ec.sql, but also allow deploy/ec.sql for flexibility.
SQL_FILE="${SQL_FILE:-}"
if [[ -z "${SQL_FILE}" ]]; then
  if [[ -f "$DEPLOY_DIR/scripts/rag.sql" ]]; then
    SQL_FILE="$DEPLOY_DIR/scripts/rag.sql"
  else
    err "Could not find rag.sql. "
  fi
fi


echo "[init-postgres] Creating schema/tables and seeding data..."

psql -v ON_ERROR_STOP=1 "$DATABASE_URL"  -f "$SQL_FILE"

echo "[init-postgres] Done."
