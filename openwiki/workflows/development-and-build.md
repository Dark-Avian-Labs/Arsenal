---
type: Workflow
title: Development & Build
description: The dev/build/start scripts, the two-process dev model with Vite proxy, env loading, and how production output is assembled.
tags: [workflow, dev, build, vite, scripts]
timestamp: 2026-08-23T01:30:00Z
---

# Overview

AppBase has distinct development and production topologies. In development two processes run behind
a Vite proxy; in production a single Express process serves the pre-built client. Scripts are
defined in `package.json`; the dev orchestrator is `scripts/dev.mjs`. Env files are loaded by the
server itself (`server/config.ts`, see [configuration](../operations/configuration.md)) — there is
no `--env-file` flag anywhere.

# Development (`pnpm dev`)

`scripts/dev.mjs` spawns two child processes with `NODE_ENV=development` and `SECURE_COOKIES=0`
forced, and forwards their stdio:

1. **API server** — `tsx watch server/index.ts`; the server loads `.env.development` in-process.
2. **Vite client** — `vite --port <VITE_DEV_PORT>` (default `5173`); Vite reads `.env.development`
   directly for `VITE_*` values.

Vite proxies `/api` to the server (`vite.config.ts`), whose target is `VITE_DEV_API_TARGET`
(default `http://127.0.0.1:3000` — the AppBase slot in the org port map). If either child exits,
the orchestrator tears down both and exits with that code. Open `http://127.0.0.1:5173`.

# Build (`pnpm run build`)

Runs in sequence (`package.json`):

1. `pnpm run typecheck` — both `tsconfig.server.json` and `tsconfig.json`.
2. `tsc -p tsconfig.server.json` — compile server to `dist/server`.
3. `vite build` — bundle client to `dist/client`; reads plaintext `VITE_*` values from
   `.env.production` (which is why `VITE_*` must never be dotenvx-encrypted).

`VITE_BASE_PATH` sets the client base for nested deployments.

# Production (`pnpm start`)

`NODE_ENV=production node dist/server/index.js` starts the compiled server, which loads
`.env.production` (+ `.env.keys` for decryption), serves `dist/client`, and falls back to
`index.html` for client routing. Runtime behavior is covered in
[server runtime](../architecture/server-runtime.md).

# Other scripts

`lint` / `lint:fix` (oxlint), `format` / `check-format` (oxfmt), `test` / `test:watch` /
`test:coverage` (Vitest), and `validate` — the pre-commit/CI gate documented in
[validate & CI](../operations/validate-and-ci.md).

# Where to start

- `scripts/dev.mjs`, `vite.config.ts`, `package.json` scripts

# What to watch out for

- **Dev forces insecure cookies.** `SECURE_COOKIES=0` is injected so login works over plain HTTP
  locally; do not rely on that in any deployed environment.
- **`pnpm start` needs `NODE_ENV` set** (usually by PM2/systemd); without it the server loads the
  development env file.
- **Native module first.** After changing Node versions, run `pnpm rebuild better-sqlite3` or the
  preflight in [validate & CI](../operations/validate-and-ci.md) will fail.
