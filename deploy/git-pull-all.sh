#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/opt/stacks"

echo "=== Bulk Git Commit + Push ==="
echo "Base: $BASE_DIR"
echo

cd "$BASE_DIR"

for dir in */ ; do
  REPO="${dir%/}"

  echo "--------------------------------------------------"
  echo "Checking: $REPO"

  # skip if not a git repo
  if [[ ! -d "$REPO/.git" ]]; then
    echo "  -> Not a git repo, skipping"
    continue
  fi

  cd "$REPO"

  # skip if nothing changed
  if [[ -z "$(git status --porcelain)" ]]; then
    echo "  -> No changes"
    cd "$BASE_DIR"
    continue
  fi

  echo "  -> Changes detected"
  git pull

  cd "$BASE_DIR"
done

echo
echo "=== Done ==="