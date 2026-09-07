# AppBase

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PR](https://github.com/Dark-Avian-Labs/AppBase/actions/workflows/pr.yml/badge.svg)](https://github.com/Dark-Avian-Labs/AppBase/actions/workflows/pr.yml)
![Node](https://img.shields.io/badge/Node-%3E%3D26-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-06B6D4?logo=tailwindcss&logoColor=white)
[![Cursor](https://img.shields.io/badge/Cursor-IDE-141414?logo=cursor&logoColor=white)](https://cursor.com)

AppBase is the starter for new Dark Avian Labs web apps. It ships the shared shell, glass design system, Express server baseline, and Clerk authentication wired end to end (server middleware, sign-in/up pages, protected routes). Domain features are left empty on purpose.

## Features

- Express server with `helmet` + Clerk-aware CSP, sessions (in-repo SQLite store), CSRF, layered rate limiting, request IDs, structured JSON logging, health/readiness endpoints, crash guards, and graceful shutdown
- Clerk authentication scaffolding: `clerkMiddleware`, `requireAuthApi` / `requireAdmin`, `/api/auth/me`, client `AuthProvider`, `ProtectedRoute`, themed sign-in/up pages — runs unauthenticated in dev until keys are added
- Encrypted env files via [dotenvx](https://dotenvx.com): `.env.development` / `.env.production` are committed with secrets encrypted; private keys stay in gitignored `.env.keys`
- React + Vite + Tailwind shell with theme mode + UI style picker and layered ASCII/hex backgrounds
- Shared design tokens, glass surfaces, and UI primitives (`Button`, `Input`, `GlassCard`, `Modal`, `Menu`)
- Org engineering standards under [`docs/org-standards/`](docs/org-standards/)

## Requirements

- Node.js 26+
- pnpm 12+

## Quick start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Environment: the app loads `.env.development` / `.env.production` itself based on `NODE_ENV` (no `--env-file` needed). Encrypted values require the private keys in `.env.keys` (gitignored — get them from the deployment host or password manager, or re-encrypt your own values). See [.env.example](.env.example) for every variable.

3. Run in development (Vite HMR + watched API server):

   ```bash
   pnpm dev
   ```

   Open `http://127.0.0.1:5173`. API requests are proxied to the Express server (`VITE_DEV_API_TARGET`, default `http://127.0.0.1:3000`). Without Clerk keys the app runs unauthenticated; add `CLERK_SECRET_KEY` + `VITE_CLERK_PUBLISHABLE_KEY` to enable auth.

4. Build and run production:

   ```bash
   pnpm run build
   NODE_ENV=production pnpm start
   ```

## Examples

In-app probe for humans and README copy. Load balancers should hit `/readyz` (session DB). `/healthz` is process liveness and does not open a session.

```bash
curl -sS http://127.0.0.1:3000/api/health
curl -sS http://127.0.0.1:3000/healthz
curl -sS http://127.0.0.1:3000/readyz
```

## Ports

Default listen ports so the apps can sit side by side. Codex still defaults to 3001, same as BudgetPlanner; set `PORT` if you run both.

| App           | Port |
| ------------- | ---- |
| AppBase       | 3000 |
| BudgetPlanner | 3001 |
| Armory        | 3002 |
| Codex         | 3001 |

## Environment

Secrets in the committed env files are encrypted with dotenvx
(`pnpm dotenvx encrypt -f .env.production -k SESSION_SECRET -k CLERK_SECRET_KEY`).
`pnpm dev` decrypts `.env.development` before starting Vite, same pattern CI uses for
`vite build`. Bare `vite` / `pnpm run dev:client` / unwrapped `pnpm run build` still
read the file as text, so encrypting `VITE_*` garbles those.

| Variable                          | Description                                                              |
| --------------------------------- | ------------------------------------------------------------------------ |
| `PORT`, `HOST`                    | Server bind address (default `3000` / `127.0.0.1`).                      |
| `APP_NAME`, `APP_ID`              | Display name and app id (session cookie prefix, Clerk role lookup).      |
| `APP_PUBLIC_BASE_URL`             | Public origin; required when Clerk is enabled (authorized parties).      |
| `ALLOWED_APP_ORIGINS`             | Extra Clerk authorized-party origins (comma-separated).                  |
| `SESSION_SECRET`                  | Required and 32+ chars in production; encrypt with dotenvx.              |
| `SESSION_COOKIE_NAME`             | Session cookie key (defaults to `<APP_ID>.sid`).                         |
| `TRUST_PROXY`, `SECURE_COOKIES`   | Reverse proxy and secure cookie behavior.                                |
| `COOKIE_DOMAIN`                   | Org-wide (`.darkavianlabs.com`) in production: apps share one login.     |
| `SESSION_DB_PATH`                 | SQLite session store location.                                           |
| `CLERK_SECRET_KEY`                | Clerk server key; required in production, empty = auth disabled in dev.  |
| `VITE_CLERK_PUBLISHABLE_KEY`      | Clerk publishable key (also used server-side).                           |
| `CLERK_FAPI_URL`                  | Override the Clerk frontend-API origin used in the CSP.                  |
| `SHUTDOWN_TIMEOUT_MS`             | Graceful shutdown deadline (default `10000`).                            |
| `VITE_SHARED_THEME_COOKIE_DOMAIN` | Optional domain for shared theme cookie.                                 |
| `VITE_DEV_API_TARGET`             | Optional Vite dev proxy target for `/api`.                               |
| `VITE_DEV_PORT`                   | Optional Vite dev server port (default `5173`).                          |
| `VITE_BASE_PATH`                  | Optional Vite base path for nested deployments.                          |
| `VITE_APP_NAME`                   | App title shown in the shell header/home page.                           |
| `VITE_LEGAL_ENTITY_NAME`          | Footer legal name.                                                       |
| `VITE_LEGAL_CONTACT_*`            | Legal page contact details (`NAME`, `STREET`, `CITY`, `PHONE`, `EMAIL`). |
| `VITE_SEARCH_PLACEHOLDER`         | Search input placeholder text.                                           |

## Scripts

| Script                   | Description                                      |
| ------------------------ | ------------------------------------------------ |
| `pnpm run validate`      | Preflight + format, lint, typecheck, and tests.  |
| `pnpm run typecheck`     | Run both server and client type checks.          |
| `pnpm dev`               | Decrypt `.env.development`, then Vite + Express. |
| `pnpm run build`         | Typecheck + compile server + build client.       |
| `pnpm start`             | Run production server from `dist/`.              |
| `pnpm run lint`          | Run oxlint.                                      |
| `pnpm run lint:fix`      | Run oxlint with auto-fix.                        |
| `pnpm run format`        | Run oxfmt.                                       |
| `pnpm run check-format`  | Check formatting with oxfmt.                     |
| `pnpm run test`          | Run Vitest once.                                 |
| `pnpm run test:watch`    | Run Vitest in watch mode.                        |
| `pnpm run test:coverage` | Run Vitest with V8 coverage report.              |

## Development

- Design system and porting contracts: [AGENTS.md](AGENTS.md)
- Org CI/README/validate standards: [docs/org-standards/](docs/org-standards/)

### Scaffold contracts

- `client/app/` — `config.ts`, `paths.ts`, `routes.tsx` (routing only)
- `client/features/<feature>/` — page UI + feature state
- `client/features/auth/` — Clerk provider glue, `ProtectedRoute`, sign-in/up pages
- `client/components/ui/` — shared primitives only
- `server/routes/` — thin routes; keep `/api/health`, `/api/csrf`, and `/api/auth/me`
- `server/auth/` — Clerk middleware, role helpers, authorized parties
- `client/clerk/` — Clerk appearance helpers and auth shell

## License

MIT
