#!/usr/bin/env bash
set -euo pipefail

# Resolve deploy dir from this script's location
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# hard pin compose identity
COMPOSE_PROJECT_NAME="$(basename "$(dirname "$DEPLOY_DIR")")"

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1


docker compose -p "$COMPOSE_PROJECT_NAME" -f "$DEPLOY_DIR"/compose.yml down -v --remove-orphans

echo "[up] Generating env + secrets"
bash -x "$DEPLOY_DIR/scripts/init-env.sh"

echo "[up] Building + starting stack"
docker compose -p "$COMPOSE_PROJECT_NAME" -f "$DEPLOY_DIR"/compose.yml build --no-cache

echo "[up] Building + starting stack"
docker compose -p "$COMPOSE_PROJECT_NAME" -f "$DEPLOY_DIR"/compose.yml up -d --remove-orphans

echo "[up] Done"
