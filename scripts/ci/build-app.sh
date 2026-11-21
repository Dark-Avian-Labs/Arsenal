#!/usr/bin/env bash
set -euo pipefail

app="${1:?app directory name required}"

if [ -z "${DOTENV_PRIVATE_KEY_PRODUCTION:-}" ]; then
  echo "ERROR: DOTENV_PRIVATE_KEY_PRODUCTION is missing or empty."
  exit 1
fi

if [ "$app" = "arsenal" ]; then
  if [ -f "apps/arsenal/.env.production" ]; then
    pnpm --dir "apps/arsenal" exec dotenvx run --strict -f .env.production -- pnpm run build
  else
    pnpm --dir "apps/arsenal" run build
  fi
  exit 0
fi

pnpm --dir "apps/$app" exec dotenvx run --strict -f .env.production -- pnpm run build
