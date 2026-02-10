#!/usr/bin/env bash
set -euo pipefail

# deploy/scripts/init-env.sh
# Always regenerates deploy/env/*.env from *.env.example (clean slate every run).
# Generates a fresh POSTGRES_PASSWORD and writes DATABASE_URL deterministically.
# Resolve deploy dir from this script's location
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
ENV_DIR="$(cd -- "$SCRIPT_DIR/../env" >/dev/null 2>&1 && pwd)"



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
  local mod_rag_api_file="${ENV_DIR}/mod-rag-api.env"

  if grep -q '^POSTGRES_PASSWORD=CHANGE_ME' "$pg_file"; then
      local pg_pass
      pg_pass="$(gen_secret)"
      replace_key "$pg_file" "POSTGRES_PASSWORD" "$pg_pass"
      log "Generated POSTGRES_PASSWORD in $(basename "$pg_file")"
    else
      log "POSTGRES_PASSWORD already set in $(basename "$pg_file")"
    fi

    if grep -q '^POSTGRES_PASSWORD=CHANGE_ME' "$mod_rag_api_file"; then
      local pg_pass_current
      pg_pass_current="$(awk -F= '/^POSTGRES_PASSWORD=/{print $2}' "$pg_file" | tr -d '\r')"
      replace_key "$cloud_file" "POSTGRES_PASSWORD" "$pg_pass_current"
      log "Copied POSTGRES_PASSWORD into $(basename "$mod_rag_api_file")"
    fi

    # Deterministically write DATABASE_URL (no placeholder patching)
    local dsn
    dsn="postgresql://${user}:${pg_pass}@${host}:${port}/${db}?sslmode=disable"
    replace_key "$mod_rag_api_file" "DATABASE_URL" "$dsn"
    replace_key "$pg_file" "DATABASE_URL" "$dsn"
    log "Wrote DATABASE_URL deterministically"

    log "Environment initialization complete ✔"
}

main "$@"
