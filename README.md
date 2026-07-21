# AppBase

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PR](https://github.com/Dark-Avian-Labs/AppBase/actions/workflows/pr.yml/badge.svg)](https://github.com/Dark-Avian-Labs/AppBase/actions/workflows/pr.yml)
![Node](https://img.shields.io/badge/Node-%3E%3D26-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-06B6D4?logo=tailwindcss&logoColor=white)
[![Cursor](https://img.shields.io/badge/Cursor-IDE-141414?logo=cursor&logoColor=white)](https://cursor.com)

AppBase is a reusable starter for new Dark Avian Labs apps. It ships the shared shell UX, design system, and server baseline while leaving domain features intentionally empty. Authentication is not included by default — wire [Clerk](client/clerk/) when an app needs it.

## Features

- Express server with `helmet`, sessions, CSRF, layered rate limiting, health/readiness endpoints, and graceful shutdown
- React + Vite + Tailwind shell with theme mode + UI style picker and layered ASCII/hex backgrounds
- Shared design tokens, glass surfaces, and UI primitives (`Button`, `Input`, `GlassCard`, `Modal`, `Menu`)
- Optional Clerk styling helpers in `client/clerk/` (not wired by default)
- Org engineering standards under [`docs/org-standards/`](docs/org-standards/)

## Requirements

- Node.js 26+
- pnpm 11+

## Quick start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create your env file:

   ```bash
   cp .env.example .env
   ```

3. Run in development (Vite HMR + watched API server):

   ```bash
   pnpm dev
   ```

   Open `http://127.0.0.1:5173`. API requests are proxied to the Express server (`VITE_DEV_API_TARGET`, default `http://127.0.0.1:3002`).

4. Build and run production:

   ```bash
   pnpm run build
   pnpm start
   ```

## Examples

```bash
curl -sS http://127.0.0.1:3002/api/health
```

## Environment

| Variable                          | Description                                        |
| --------------------------------- | -------------------------------------------------- |
| `PORT`, `HOST`                    | Server bind address.                               |
| `APP_NAME`, `APP_ID`              | Display name and app id (session cookie prefix).   |
| `SESSION_SECRET`                  | Required in production; use a strong random value. |
| `SESSION_COOKIE_NAME`             | Session cookie key (defaults to `<APP_ID>.sid`).   |
| `TRUST_PROXY`, `SECURE_COOKIES`   | Reverse proxy and secure cookie behavior.          |
| `COOKIE_DOMAIN`                   | Optional shared cookie domain.                     |
| `SESSION_DB_PATH`                 | SQLite session store location.                     |
| `VITE_SHARED_THEME_COOKIE_DOMAIN` | Optional domain for shared theme cookie.           |
| `VITE_DEV_API_TARGET`             | Optional Vite dev proxy target for `/api`.         |
| `VITE_DEV_PORT`                   | Optional Vite dev server port (default `5173`).    |
| `VITE_BASE_PATH`                  | Optional Vite base path for nested deployments.    |
| `VITE_APP_NAME`                   | App title shown in the shell header/home page.     |
| `VITE_LEGAL_ENTITY_NAME`          | Footer legal name.                                 |
| `VITE_SEARCH_PLACEHOLDER`         | Search input placeholder text.                     |

## Scripts

| Script                   | Description                                      |
| ------------------------ | ------------------------------------------------ |
| `pnpm run validate`      | Preflight + format, lint, typecheck, and tests.  |
| `pnpm run typecheck`     | Run both server and client type checks.          |
| `pnpm dev`               | Vite dev server + Express API with watch reload. |
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
- Agent wiki: [openwiki/quickstart.md](openwiki/quickstart.md)

### Scaffold contracts

- `client/app/` — `config.ts`, `paths.ts`, `routes.tsx` (routing only)
- `client/features/<feature>/` — page UI + feature state
- `client/components/ui/` — shared primitives only
- `server/routes/` — thin routes; keep `/api/health` and `/api/csrf`
- `client/clerk/` — optional Clerk appearance helpers

## License

MIT
