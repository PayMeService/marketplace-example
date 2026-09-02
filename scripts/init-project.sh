#!/usr/bin/env bash
# Rename this bootstrap repo into a fresh project.
#
# Usage:
#   ./scripts/init-project.sh <app-name>
#
# What it does:
#   1. Replaces every occurrence of `fullstack-bootstrap` with <app-name>
#      across tracked files (skips .git, node_modules, build output, this script).
#   2. Removes the upstream .git and re-inits a fresh repo on `main`.
#   3. Copies .env.example → .env (only if .env doesn't already exist).

set -euo pipefail

APP_NAME="${1:-}"
if [[ -z "$APP_NAME" ]]; then
  echo "usage: $0 <app-name>" >&2
  exit 2
fi
if ! [[ "$APP_NAME" =~ ^[a-z][a-z0-9-]{0,62}[a-z0-9]$ ]]; then
  echo "error: app name must be lowercase, start with a letter, and contain only letters/digits/hyphens (e.g. my-app)" >&2
  exit 2
fi

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
SCRIPT_REL="scripts/init-project.sh"

echo "→ Renaming fullstack-bootstrap → $APP_NAME"
# GNU sed (Linux). On macOS, install gnu-sed (`brew install gnu-sed`) and use `gsed`.
find . -type f \
  ! -path "./.git/*" \
  ! -path "./node_modules/*" \
  ! -path "./frontend/node_modules/*" \
  ! -path "./backend/node_modules/*" \
  ! -path "./frontend/dist/*" \
  ! -path "./backend/dist/*" \
  ! -path "./$SCRIPT_REL" \
  -exec sed -i "s/fullstack-bootstrap/$APP_NAME/g" {} +

echo "→ Resetting git history"
rm -rf "$ROOT/.git"
git init -b main >/dev/null
git add . >/dev/null
git commit -m "Initialize $APP_NAME from fullstack-bootstrap" >/dev/null

if [[ ! -f .env ]]; then
  echo "→ Creating .env from .env.example"
  cp .env.example .env
else
  echo "→ Skipping .env (already exists)"
fi

cat <<EOF

✔ Initialized $APP_NAME

Next:
  make dev                # vite + nest watch + postgres (hot reload)
  # or
  docker compose -f docker-compose.dev.yml up --build

Then visit:
  Frontend  http://localhost:\${FRONTEND_HOST_PORT:-5173}
  Backend   http://localhost:\${BACKEND_HOST_PORT:-3000}/api/health
EOF
