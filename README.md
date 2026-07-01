# AppBase

AppBase is a reusable starter for new Dark Avian Labs apps. It keeps the shared shell UX and centralized auth plumbing while leaving domain features intentionally empty.

## Included baseline

- Express server with `helmet`, sessions, CSRF, layered rate limiting, health/readiness endpoints, and graceful shutdown
- Centralized auth integration only (no local auth bypass paths)
- React + Vite + Tailwind shell page with:
  - top header with brand lockup
  - search input placeholder
  - user menu (admin/profile/logout)
  - theme toggle
  - profile + password change modal
- Shared design tokens and glass styles
- Reusable UI primitives: `Button`, `Input`, `GlassCard`, `Modal`, `Menu`

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create your env file:

   ```bash
   cp .env.example .env
   ```

3. Build and run:

   ```bash
   pnpm run build
   pnpm start
   ```

## Environment

| Variable                          | Description                                               |
| --------------------------------- | --------------------------------------------------------- |
| `PORT`, `HOST`                    | Server bind address.                                      |
| `APP_NAME`, `APP_ID`              | Display name and auth app id used for permission checks.  |
| `SESSION_SECRET`                  | Required in production; use a strong random value.        |
| `SESSION_COOKIE_NAME`             | Session cookie key (defaults to `<APP_ID>.sid`).          |
| `TRUST_PROXY`, `SECURE_COOKIES`   | Reverse proxy and secure cookie behavior.                 |
| `COOKIE_DOMAIN`                   | Optional shared cookie domain.                            |
| `AUTH_SERVICE_URL`                | Primary Auth service base URL.                            |
| `AUTH_FALLBACK_SERVICE_URL`       | Fallback Auth service base URL.                           |
| `APP_PUBLIC_BASE_URL`             | Canonical public URL for building login redirect targets. |
| `AUTH_FETCH_TIMEOUT_MS`           | Timeout for auth proxy requests.                          |
| `CENTRAL_DB_PATH`                 | Shared central DB location (users/sessions/access).       |
| `VITE_AUTH_ADMIN_URL`             | Auth admin URL used by the client admin page.             |
| `VITE_SHARED_THEME_COOKIE_DOMAIN` | Optional domain for shared theme cookie.                  |
| `VITE_DEV_API_TARGET`             | Optional Vite dev proxy target for `/api`.                |
| `VITE_BASE_PATH`                  | Optional Vite base path for nested deployments.           |
| `VITE_APP_NAME`                   | App title shown in the shell header/home page.            |
| `VITE_LEGAL_ENTITY_NAME`          | Footer legal name.                                        |
| `VITE_SEARCH_PLACEHOLDER`         | Search input placeholder text.                            |

## Scripts

| Script                   | Description                                     |
| ------------------------ | ----------------------------------------------- |
| `pnpm run validate`      | Preflight + format, lint, typecheck, and tests. |
| `pnpm run typecheck`     | Run both server and client type checks.         |
| `pnpm run build`         | Typecheck + compile server + build client.      |
| `pnpm start`             | Run production server from `dist/`.             |
| `pnpm run lint`          | Run oxlint.                                     |
| `pnpm run lint:fix`      | Run oxlint with auto-fix.                       |
| `pnpm run format`        | Run oxfmt.                                      |
| `pnpm run check-format`  | Check formatting with oxfmt.                    |
| `pnpm run test`          | Run Vitest once.                                |
| `pnpm run test:watch`    | Run Vitest in watch mode.                       |
| `pnpm run test:coverage` | Run Vitest with V8 coverage report.             |

## Scaffold Contracts

Use these contracts so app ports stay low-risk and consistent:

- `client/app/`
  - `config.ts`: env-driven display/config constants for shell text and links
  - `paths.ts`: central route path definitions
  - `routes.tsx`: route wiring only (no domain logic)
- `client/features/<feature>/`
  - keep page-level UI and feature state together (e.g. `admin/`, `profile/`)
  - feature modules import shared shell primitives from `client/components/ui/`
- `client/components/`
  - `Layout/`: global app shell (header/content/footer + menu)
  - `ui/`: reusable primitives only (`Button`, `Input`, `GlassCard`, `Modal`, `Menu`)
- `server/routes/`
  - keep routes thin and scoped; mount from `server/index.ts`
  - keep `/api/health` as baseline; add app-specific routes under dedicated route modules
- `server/auth/`
  - centralized auth proxy/sync logic only (do not duplicate auth flows in feature routes)

## Extending AppBase

- Add new API routes under `server/routes/` and mount them in `server/index.ts` under `/api`.
- Add app-specific features under `client/features/<feature>/` and wire pages in `client/app/routes.tsx`.
- Keep shared auth state in `client/features/auth/` and local profile persistence in `client/features/profile/`.
- Build new visual surfaces from existing UI primitives before adding one-off class patterns.
- Keep shared auth middleware and shell layout to preserve ecosystem consistency.
