#!/usr/bin/env bash
set -euo pipefail

app="${1:?app directory name required}"

if [ -z "${DOTENV_PRIVATE_KEY_PRODUCTION:-}" ]; then
  echo "ERROR: DOTENV_PRIVATE_KEY_PRODUCTION is missing or empty."
  exit 1
fi

pnpm --dir "apps/$app" exec dotenvx run --strict -f .env.production -- pnpm run build
