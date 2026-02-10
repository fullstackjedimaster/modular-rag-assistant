#!/usr/bin/env bash
set -euo pipefail

# deploy/scripts/init-env.sh
# Creates deploy/env/*.env from *.env.example (always fresh).
# Generates strong secrets and hydrates DATABASE_URL automatically.

ENV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../env" && pwd)"

log()  { echo -e "\033[1;32m[+] $*\033[0m"; }
warn() { echo -e "\033[1;33m[!] $*\033[0m"; }
err()  { echo -e "\033[1;31m[✗] $*\033[0m" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || err "Missing required command: $1"; }

need cp
need sed
need awk

# ---------------------------------------------------------
# Generate strong random secret
# ---------------------------------------------------------
gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -d '\n'
  else
    python - <<'PY'
import secrets, base64
print(base64.b64encode(secrets.token_bytes(48)).decode().strip())
PY
  fi
}

# Escape sed replacement characters safely
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

# ---------------------------------------------------------
# Replace password inside DATABASE_URL safely
# ---------------------------------------------------------
replace_db_url_password_placeholder() {
  local file="$1"
  local new_pass_raw="$2"
  local new_pass
  new_pass="$(escape_sed_repl "$new_pass_raw")"

  if grep -q '^DATABASE_URL=.*CHANGE_ME_STRONG_PASSWORD' "$file"; then
    sed -i -E "/^DATABASE_URL=/ s/CHANGE_ME_STRONG_PASSWORD/${new_pass}/g" "$file"
    log "Patched DATABASE_URL password in $(basename "$file")"
  else
    log "DATABASE_URL placeholder not found in $(basename "$file")"
  fi
}

# ---------------------------------------------------------
# Main
# ---------------------------------------------------------
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

  # -----------------------------------------------------
  # Generate POSTGRES PASSWORD
  # -----------------------------------------------------
  local pg_pass
  pg_pass="$(gen_secret)"
  replace_key "$pg_file" "POSTGRES_PASSWORD" "$pg_pass"
  log "Generated POSTGRES_PASSWORD in postgres.env"

  # Sync into API env
  replace_key "$mod_rag_api_file" "POSTGRES_PASSWORD" "$pg_pass"
  log "Synced POSTGRES_PASSWORD into mod-rag-api.env"

  # Replace inside DATABASE_URL
  replace_db_url_password_placeholder "$mod_rag_api_file" "$pg_pass"

  log "Environment initialization complete ✔"
}

main "$@"
