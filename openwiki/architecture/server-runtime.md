---
type: Architecture Overview
title: Server Runtime
description: The Express app factory, middleware chain, Clerk auth, SQLite session store, CSRF, rate limiting, structured logging, health endpoints, graceful shutdown, and crash guards.
tags: [architecture, express, security, sessions, csrf, clerk, logging]
timestamp: 2026-08-23T01:30:00Z
---

# Overview

The server is split into `server/app.ts` — `createApp()`, a factory that assembles the full
Express 5 app (used by both the entrypoint and the supertest suite) — and `server/index.ts`, the
entrypoint that listens, handles signals, and guards against crashes. All tunable behavior is read
through [configuration](../operations/configuration.md).

# Boot sequence (`createApp` + `index.ts`)

1. `ensureDataDirs()` creates `data/` if missing (`server/config.ts`).
2. `getSessionDb()` opens the SQLite session DB lazily with `journal_mode = WAL`,
   `foreign_keys = ON`, and `busy_timeout = 5000` (`server/db/connection.ts`). Tests inject an
   in-memory DB via `createApp({ sessionDb })`.
3. `new SqliteSessionStore({ db })` creates the `sessions` table if absent and starts a 15-minute
   expired-row sweep (`server/db/sqliteSessionStore.ts` — in-repo store, replaces the unmaintained
   `better-sqlite3-session-store` package; same table shape as before).
4. `index.ts` starts listening on `HOST:PORT` and registers signal + crash handlers.

# Middleware chain (order matters)

The order in `server/app.ts` is deliberate:

1. `trust proxy` (if `TRUST_PROXY`) — and a **fatal guard**: production + `SECURE_COOKIES` without
   `TRUST_PROXY` throws at startup.
2. `createAppHelmet()` — helmet with a CSP extended for Clerk FAPI, `img.clerk.com`, and
   Cloudflare Turnstile (`server/http/helmetCsp.ts`).
3. `requestIdMiddleware` — echoes a well-formed `X-Request-Id` or generates a UUID; exposed on
   `res.locals` for log correlation (`server/http/requestId.ts`).
4. Body parsers: `express.json({ limit: '100kb' })`, `urlencoded` (same limit), `cookieParser`.
5. **Baseline rate limiter** — 1200 req / 15 min, skipping `/healthz`, `/readyz`, `/favicon.ico`,
   and static assets.
6. `clerkMiddleware()` — real `@clerk/express` middleware with `authorizedParties` when keys are
   configured, a pass-through otherwise (`server/auth/middleware.ts`).
7. `express-session` backed by `SqliteSessionStore`; cookie is `httpOnly`, `sameSite: lax`,
   `secure` per `SECURE_COOKIES`, optional `domain`.
8. **CSRF** via `csrf-sync`: token read from `_csrf` body field or `x-csrf-token` /
   `x-xsrf-token` headers, stored in the session; a following middleware exposes a fresh token on
   `res.locals.csrfToken`.
9. `/api` request logging — one structured JSON line per API request (method, path, status,
   duration, request ID) via `server/logger.ts`.
10. Route-scoped limiters: `/api` (600/15min) plus separate public-page and static-asset limiters.

# Auth

- `server/auth/middleware.ts` — `getClerkAuthState(req)` (userId + `isAdmin` from the Clerk
  `metadata.apps[APP_ID]` claim), `requireAuthApi` (401), `requireAdmin` (401/403).
- `server/auth/clerk.ts` — org role convention (`metadata.apps: { "<appId>": "admin" }`).
- `server/auth/clerkAuthorizedParties.ts` — allowed `azp` origins: `APP_PUBLIC_BASE_URL`,
  `ALLOWED_APP_ORIGINS`, plus localhost dev ports outside production.
- `server/routes/auth.ts` — `GET /api/auth/me` (behind `requireAuthApi`) returns
  `{ authenticated, userId, isAdmin }` for the client [AuthProvider](../integrations/clerk.md).

# Routes

- `/api` → `apiRouter` (`server/routes/api.ts`): `GET /api/health`, `GET /api/csrf`, and the
  mounted `authRouter` under `/api/auth`. Unmatched `/api/*` → `404 { error: 'Not found' }`.
- `GET /healthz` — liveness; `GET /readyz` — readiness, runs `SELECT 1` against the session DB and
  returns `503` on failure.
- Static: `/assets` served immutable with 1-year cache; the rest of `dist/client` with 1-hour
  cache (`index.html` forced to `no-cache`); GET/HEAD fall back to `index.html` for client
  routing. If the client build is missing, page routes return `503` with a build hint instead of
  crashing `sendFile` (the check re-arms so a later build is picked up).
- The final error handler distinguishes CSRF failures (`403` + `X-CSRF-Error: 1` +
  `code: CSRF_INVALID`, which the client uses to refresh its token and retry), honors http-error
  status codes, logs a structured line with the request ID, and never leaks internals on 500s.

# Sessions and CSRF together

Sessions are the source of truth for the CSRF token (synchronizer-token pattern): the token is
stored in `req.session.csrfToken` and validated on state-changing requests. The SPA fetches it from
`GET /api/csrf`, sends it back via header, and retries once with a fresh token when the server
answers with `X-CSRF-Error` (`client/utils/api.ts`). The `express-session` type is augmented in
`server/types/express-session.d.ts` so `session.csrfToken` is typed.

# Shutdown and crash guards

`SIGINT`/`SIGTERM` trigger `shutdown(0)`: stop accepting connections, stop the session-store sweep
timer, close the session DB, and exit — with a `SHUTDOWN_TIMEOUT_MS` (default 10s) hard-timeout
fallback. `unhandledRejection` and `uncaughtException` log the error and run the same shutdown with
exit code 1 so a process manager restarts a clean instance (`server/index.ts`).

# Where to start

- `server/app.ts` — the whole chain top to bottom
- `server/index.ts` — lifecycle (listen, signals, crash guards)
- `server/routes/api.ts` — add new endpoints here
- `server/auth/` — Clerk middleware + role helpers
- `server/db/` — session store connection + schema + store

# What to watch out for

- **Add API routes to the `apiRouter`, above the `/api` 404.** Anything registered after the
  catch-all for `/api` will 404.
- **Readiness depends on the session DB.** `/readyz` returns `503` if the SQLite handle can't
  answer `SELECT 1`; wire load balancers to `/readyz`, not `/healthz`.
- **Auth-gated routes 401 when Clerk keys are absent** — expected in local dev; production refuses
  to boot without keys (see [configuration](../operations/configuration.md)).
- The middleware chain is covered by supertest tests in `server/app.test.ts`; the session store by
  `server/db/sqliteSessionStore.test.ts` (see [validate & CI](../operations/validate-and-ci.md)).
