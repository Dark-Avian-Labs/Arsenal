---
type: Operations Guide
title: Configuration
description: dotenvx-encrypted env files, environment variables, defaults, and the session/security invariants enforced at server startup.
tags: [operations, configuration, env, dotenvx, security, sessions]
timestamp: 2026-08-23T01:30:00Z
---

# Overview

Configuration is environment-driven with **committed, partially encrypted env files**.
`server/config.ts` loads env in-process at import time via `@dotenvx/dotenvx`:

1. `.env.keys` (gitignored) — provides `DOTENV_PRIVATE_KEY_*` for decrypting encrypted values.
2. `.env.<NODE_ENV>` — `.env.test` when `NODE_ENV=test` (optional, skipped if absent), otherwise
   `.env.production` / `.env.development` with fallback between them.

Values already present in `process.env` are never overridden, so PM2/CI-provided vars win.
`NODE_ENV` itself is set by the process manager or `scripts/dev.mjs`, never inside the env files.

Secrets are encrypted per file with
`pnpm dotenvx encrypt -f .env.production -k SESSION_SECRET -k CLERK_SECRET_KEY`. Everything
`VITE_*` stays **plaintext** on purpose: Vite reads the env file directly at build time and would
otherwise inline encrypted garbage into the bundle. `.env.example` documents every variable.

# Server variables

| Variable                     | Default                           | Purpose                                                                                                                       |
| ---------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                       | `3000`                            | Listen port. BudgetPlanner and Codex default to 3001; Armory to 3002.                                                         |
| `HOST`                       | `127.0.0.1`                       | Bind address.                                                                                                                 |
| `NODE_ENV`                   | `development`                     | Selects the env file; enables production invariants.                                                                          |
| `APP_NAME`                   | `AppBase`                         | Display name in logs/health responses.                                                                                        |
| `APP_ID`                     | `appbase`                         | Session cookie prefix and Clerk `metadata.apps` role key.                                                                     |
| `APP_PUBLIC_BASE_URL`        | unset                             | Public origin; required when Clerk is enabled.                                                                                |
| `ALLOWED_APP_ORIGINS`        | unset                             | Extra Clerk authorized-party origins (comma-separated).                                                                       |
| `SESSION_SECRET`             | dev-only fallback                 | Session signing key; **32+ chars required in production**.                                                                    |
| `SESSION_COOKIE_NAME`        | `<APP_ID>.sid`                    | Session cookie key.                                                                                                           |
| `TRUST_PROXY`                | off                               | `1`/`true` to trust `X-Forwarded-*` behind a proxy.                                                                           |
| `SECURE_COOKIES`             | on in production                  | `1`/`true` to mark the session cookie `Secure`.                                                                               |
| `COOKIE_DOMAIN`              | unset                             | `.darkavianlabs.com` in production — intentional org-wide cookie so all DAL apps share one login and theme across subdomains. |
| `SESSION_DB_PATH`            | `<root>/data/sessions.db`         | SQLite session store path (relative paths resolve from project root).                                                         |
| `CLERK_SECRET_KEY`           | unset                             | Clerk server key; empty = auth disabled (dev only).                                                                           |
| `VITE_CLERK_PUBLISHABLE_KEY` | unset                             | Clerk publishable key; normalized to `CLERK_PUBLISHABLE_KEY` for the server (`server/clerkEnv.ts`).                           |
| `CLERK_FAPI_URL`             | `https://clerk.darkavianlabs.com` | Clerk frontend-API origin used in the CSP (`server/http/helmetCsp.ts`).                                                       |
| `SHUTDOWN_TIMEOUT_MS`        | `10000`                           | Graceful shutdown deadline before hard exit.                                                                                  |

# Startup invariants

Guards that stop the server before it accepts traffic:

- **Production session secret** — missing or shorter than 32 chars throws (`server/config.ts`).
- **Production Clerk keys** — missing or still-encrypted Clerk keys throw with a dotenvx hint
  (`server/clerkEnv.ts` `normalizeClerkEnv`).
- **Secure-cookie/proxy guard** — production + `SECURE_COOKIES` without `TRUST_PROXY` throws
  (`server/app.ts`), because a secure cookie behind an unrecognized proxy would never be set.

# Client (Vite) variables

Build-time `VITE_*` values (see `.env.example`, `client/app/config.ts`, `vite.config.ts`):

- `VITE_APP_NAME`, `VITE_LEGAL_ENTITY_NAME`, `VITE_SEARCH_PLACEHOLDER` — shell text, with in-code
  fallbacks (`client/app/config.ts`).
- `VITE_CLERK_PUBLISHABLE_KEY` — enables the client auth stack (`CLERK_ENABLED`).
- `VITE_LEGAL_CONTACT_NAME/STREET/CITY/PHONE/EMAIL` — legal page contact details, kept out of
  source code (`client/features/legal/LegalPage.tsx`).
- `VITE_BASE_PATH` — client base path for nested deployments.
- `VITE_DEV_API_TARGET`, `VITE_DEV_PORT` — dev proxy target and Vite port
  ([development & build](../workflows/development-and-build.md)).
- `VITE_SHARED_THEME_COOKIE_DOMAIN` — domain for the shared `dal.*` theme cookies so theme choices
  sync across subdomains ([design system](../architecture/design-system.md)).

# Where to start

- `server/config.ts` — env loading + invariants
- `server/clerkEnv.ts` — Clerk key normalization/enforcement
- `.env.example` — the fully documented template
- `client/app/config.ts` — client-side env fallbacks

# What to watch out for

- **Never commit `.env.keys`** — it holds the dotenvx private keys. Back it up out of band.
- **Keep `VITE_*` values plaintext.** Encrypting them breaks `vite build` output (values are read
  from the file, not through dotenvx).
- **`SESSION_DB_PATH` should be absolute in production**, on a writable volume — the store is
  created on first start.
- **Tests run with no env file** (`NODE_ENV=test`, no `.env.test` by default) and rely on the
  in-code defaults.
