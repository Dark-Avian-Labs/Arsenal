# AppBase

AppBase is a reusable starter for new Dark Avian Labs apps. It keeps the shared shell UX and centralized auth plumbing while leaving domain features intentionally empty.

## Included baseline

- Express server with `helmet`, sessions, CSRF, rate limiting, health/readiness endpoints, and graceful shutdown
- Centralized auth integration via `/api/auth/*` proxy routes and access checks
- React + Vite + Tailwind shell page with:
  - top header with brand lockup
  - search input placeholder
  - admin button
  - theme toggle
  - logout and password change
- Shared design tokens and glass styles

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your env file:

   ```bash
   cp .env.example .env
   ```

3. Build and run:

   ```bash
   npm run build
   npm start
   ```

## Environment

| Variable                          | Description |
| --------------------------------- | ----------- |
| `PORT`, `HOST`                    | Server bind address. |
| `APP_NAME`, `APP_ID`              | Display name and auth app id used for permission checks. |
| `SESSION_SECRET`                  | Required in production; use a strong random value. |
| `SESSION_COOKIE_NAME`             | Session cookie key (defaults to `<APP_ID>.sid`). |
| `TRUST_PROXY`, `SECURE_COOKIES`   | Reverse proxy and secure cookie behavior. |
| `COOKIE_DOMAIN`                   | Optional shared cookie domain. |
| `AUTH_SERVICE_URL`                | Primary Auth service base URL. |
| `AUTH_FALLBACK_SERVICE_URL`       | Fallback Auth service base URL. |
| `APP_PUBLIC_BASE_URL`             | Canonical public URL for building login redirect targets. |
| `AUTH_FETCH_TIMEOUT_MS`           | Timeout for auth proxy requests. |
| `CENTRAL_DB_PATH`                 | Shared central DB location (users/sessions/access). |
| `VITE_AUTH_ADMIN_URL`             | Auth admin URL used by the client admin page. |
| `VITE_SHARED_THEME_COOKIE_DOMAIN` | Optional domain for shared theme cookie. |

## Scripts

| Script               | Description |
| -------------------- | ----------- |
| `npm run build`      | Build server + client assets. |
| `npm start`          | Run production server from `dist/`. |
| `npm run lint`       | Run ESLint. |
| `npm run format`     | Run Prettier. |
| `npm test`           | Run Vitest tests. |

## Extending AppBase

- Add new API routes under `server/routes/` and mount them in `server/index.ts` under `/api`.
- Add app-specific pages/components under `client/components/` and wire routes in `client/App.tsx`.
- Keep shared auth middleware and shell layout to preserve ecosystem consistency.
