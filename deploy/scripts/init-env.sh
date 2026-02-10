#!/usr/bin/env bash
set -euo pipefail

# deploy/scripts/init-env.sh
# Always regenerates deploy/env/*.env from *.env.example (clean slate every run).
# Generates a fresh POSTGRES_PASSWORD and writes DATABASE_URL deterministically.

ENV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../env" && pwd)"

log()  { echo -e "\033[1;32m[+] $*\033[0m"; }
err()  { echo -e "\033[1;31m[✗] $*\033[0m" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || err "Missing required command: $1"; }

need cp
need sed
need awk

gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    # URL-safe base64: translate +/ to -_ and drop =
    openssl rand -base64 48 \
      | tr -d '\n' \
      | tr '+/' '-_' \
      | tr -d '='
  elif command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
  else
    err "Need either openssl or python3 to generate secrets"
  fi
}



escape_sed_repl() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}

copy_example() {
  local example="$1"
  local target="$2"
  cp -f "$example" "$target"
  log "Wrote fresh: $(basename "$target")"
}

replace_key() {
  local file="$1"
  local key="$2"
  local value="$3"
  local escaped
  escaped="$(escape_sed_repl "$value")"
  sed -i -E "s|^(${key}=).*$|\1${escaped}|g" "$file"
}

main() {
  log "ENV_DIR=$ENV_DIR"
  mkdir -p "$ENV_DIR"

  local files=(
    "postgres.env"
    "mod-rag-api.env"
    "mod-rag.env"
  )

  log "Copying examples (fresh)..."
  for f in "${files[@]}"; do
    local example="${ENV_DIR}/${f}.example"
    local target="${ENV_DIR}/${f}"
    [[ -f "$example" ]] || err "Missing example file: $example"
    copy_example "$example" "$target"
  done

  local pg_file="${ENV_DIR}/postgres.env"
  local api_file="${ENV_DIR}/mod-rag-api.env"

  # Fresh password each run (clean slate demo)
  local pg_pass
  pg_pass="$(gen_secret)"

  # Write password into both env files
  replace_key "$pg_file"  "POSTGRES_PASSWORD" "$pg_pass"
  replace_key "$api_file" "POSTGRES_PASSWORD" "$pg_pass"
  log "Generated and synced POSTGRES_PASSWORD"

  # Read connection parts (from api env after copy) with safe defaults
  local host port db user
  host="$(awk -F= '/^POSTGRES_HOST=/{print $2}' "$api_file" | tail -n 1)"
  port="$(awk -F= '/^POSTGRES_PORT=/{print $2}' "$api_file" | tail -n 1)"
  db="$(awk -F= '/^POSTGRES_DB=/{print $2}' "$api_file" | tail -n 1)"
  user="$(awk -F= '/^POSTGRES_USER=/{print $2}' "$api_file" | tail -n 1)"

  host="${host:-postgres}"
  port="${port:-5432}"
  db="${db:-rag}"
  user="${user:-rag}"

  # Deterministically write DATABASE_URL (no placeholder patching)
  local dsn
  dsn="postgresql://${user}:${pg_pass}@${host}:${port}/${db}?sslmode=disable"
  replace_key "$api_file" "DATABASE_URL" "$dsn"
  log "Wrote DATABASE_URL deterministically"

  log "Environment initialization complete ✔"
}

main "$@"
