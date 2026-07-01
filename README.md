# AppBase

AppBase is a reusable starter for new Dark Avian Labs apps. It ships the shared shell UX, design system, and server baseline while leaving domain features intentionally empty. Authentication is not included by default — wire [Clerk](client/clerk/) when an app needs it.

## Included baseline

- Express server with `helmet`, sessions, CSRF, layered rate limiting, health/readiness endpoints, and graceful shutdown
- React + Vite + Tailwind shell page with:
  - top header with brand lockup
  - search input placeholder
  - settings menu with theme mode + UI style picker
  - theme toggle
  - layered shell background: animated ASCII wave canvas (center) + subtle hex clusters (left/right)
- Shared design tokens and glass styles
- Reusable UI primitives: `Button`, `Input`, `GlassCard`, `Modal`, `Menu`
- Optional Clerk styling helpers in `client/clerk/` (not wired by default)

## Setup

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

## Scaffold Contracts

Use these contracts so app ports stay low-risk and consistent:

- `client/app/`
  - `config.ts`: env-driven display/config constants for shell text and links
  - `paths.ts`: central route path definitions
  - `routes.tsx`: route wiring only (no domain logic)
- `client/features/<feature>/`
  - keep page-level UI and feature state together
  - feature modules import shared shell primitives from `client/components/ui/`
- `client/components/`
  - `Layout/`: global app shell (header/content/footer + menu, `AsciiWaveBackground`, `HexSideBackground`)
  - `ui/`: reusable primitives only (`Button`, `Input`, `GlassCard`, `Modal`, `Menu`)
- `client/lib/asciiBackground/`
  - canvas wave animation for the center ASCII art (ported from Codex)
- `assets/`
  - `background.txt`, `background2.txt`, `background3.txt` — ASCII art frames + accent mask for the wave animation
- `server/routes/`
  - keep routes thin and scoped; mount from `server/index.ts`
  - keep `/api/health` and `/api/csrf` as baseline; add app-specific routes under dedicated route modules
- `client/clerk/` (optional)
  - Clerk appearance builders and auth shell for apps that use `@clerk/react`

## Extending AppBase

- Add new API routes under `server/routes/` and mount them in `server/index.ts` under `/api`.
- Add app-specific features under `client/features/<feature>/` and wire pages in `client/app/routes.tsx`.
- For Clerk apps, see `AGENTS.md` and `client/clerk/` for sign-in and profile modal styling.
- Build new visual surfaces from existing UI primitives before adding one-off class patterns.
