#!/usr/bin/env bash
set -euo pipefail

# deploy/scripts/init-postgres.sh
# Hard-reset the DB every run: DROP DATABASE, CREATE DATABASE, apply rag.sql.

ENV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../env" && pwd)"
SQL_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/sql/rag.sql"

log() { echo -e "\033[1;32m[init-postgres] $*\033[0m"; }
err() { echo -e "\033[1;31m[init-postgres] $*\033[0m" >&2; exit 1; }

# Load postgres.env if present (bootstrap container usually has it via env_file too)
if [[ -f "${ENV_DIR}/postgres.env" ]]; then
  # shellcheck disable=SC2046
  export $(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "${ENV_DIR}/postgres.env" | xargs -d '\n')
fi

: "${POSTGRES_HOST:=postgres}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_DB:=rag}"
: "${POSTGRES_USER:=rag}"
: "${POSTGRES_PASSWORD:=rag}"

export PGPASSWORD="$POSTGRES_PASSWORD"

log "waiting for postgres at ${POSTGRES_HOST}:${POSTGRES_PORT}..."
until pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "postgres" >/dev/null 2>&1; do
  sleep 1
done

[[ -f "$SQL_FILE" ]] || err "Missing rag.sql at: $SQL_FILE"

log "dropping database (if exists): ${POSTGRES_DB}"
# Terminate connections and drop DB. Must connect to a different DB (postgres).
psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "postgres" -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS "${POSTGRES_DB}";
CREATE DATABASE "${POSTGRES_DB}";
SQL

log "applying rag.sql to ${POSTGRES_DB}..."
psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f "$SQL_FILE"

log "done."
