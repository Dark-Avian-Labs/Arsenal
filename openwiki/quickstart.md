---
type: Repository Overview
title: AppBase Quickstart
description: Reusable Express + React/Vite/Tailwind starter for Dark Avian Labs apps, shipping the DAL design system, a hardened server baseline, and Clerk authentication wired end to end.
tags: [overview, starter, express, react, design-system, clerk]
timestamp: 2026-08-23T01:30:00Z
---

# What AppBase is

AppBase is the shared starter for new Dark Avian Labs web apps (Codex, Armory, and future
projects). It ships the shell UX, the **DAL design system**, a hardened Express server baseline,
and **Clerk authentication wired end to end** (server middleware, `/api/auth/me`, client provider,
protected routes, themed sign-in/up pages) while leaving domain features intentionally empty.
Without Clerk keys the app runs unauthenticated — see [Clerk integration](integrations/clerk.md).

Audience: engineers and agents scaffolding a new DAL app, or keeping the design system aligned
across sibling apps.

# Stack

- **Server:** Express 5 with `helmet` (Clerk-aware CSP), `@clerk/express`, `express-session`
  (in-repo SQLite store on `better-sqlite3`), `csrf-sync`, layered `express-rate-limit`,
  structured JSON logging, and health/readiness endpoints (`server/app.ts`).
- **Client:** React 19 + React Router 8 + `@clerk/react`, built by Vite 8, styled with Tailwind
  CSS v4 (`client/main.tsx`, `vite.config.ts`).
- **Env:** committed `.env.development` / `.env.production` with secrets encrypted by
  [dotenvx](https://dotenvx.com); loaded in-process by `server/config.ts`
  ([configuration](operations/configuration.md)).
- **Tooling:** TypeScript 6, **oxlint** + **oxfmt** (not ESLint/Prettier), Vitest 4 + supertest
  (`package.json`).
- **Runtime:** Node **>=26**, pnpm **>=11.9** (`package.json` `engines` / `packageManager`).

# Structure at a glance

- `server/` — `index.ts` (entrypoint + shutdown/crash guards), `app.ts` (Express factory),
  `config.ts` (env loading), `auth/` (Clerk middleware + roles), `http/` (helmet CSP, request
  IDs), `db/` (session store), `routes/` (API + auth).
- `client/` — React SPA: `app/` (routing), `features/` (pages incl. `auth/`), `components/`
  (Layout + UI primitives), `context/` (theme), `styles/input.css` (all design tokens), `clerk/`
  (Clerk appearance + auth shell).
- `scripts/` — `dev.mjs` (dual dev processes) and `runtime-preflight.mjs`.
- `docs/org-standards/` — DAL engineering conventions mirrored into sibling apps.
- `run-quality-checks.mjs` — the `pnpm run validate` gate.

See [project structure](architecture/project-structure.md) for the full map.

# How to run

```bash
pnpm install
pnpm dev          # Vite (5173) + watched Express API (3000)
```

No env copying needed: the server loads `.env.development` itself (encrypted values need the
gitignored `.env.keys`). Production: `pnpm run build` then `NODE_ENV=production pnpm start`. Full
script reference and the dev proxy model are in
[development & build](workflows/development-and-build.md).

# Major concept pages

- [Project structure](architecture/project-structure.md) — directory map and server/client split.
- [Server runtime](architecture/server-runtime.md) — middleware chain, security stack, sessions,
  health, graceful shutdown, crash guards.
- [Design system](architecture/design-system.md) — two-axis theme model, glass surfaces, tokens,
  UI primitives, and shell backgrounds.
- [Development & build](workflows/development-and-build.md) — dev/build/start scripts and the Vite
  proxy.
- [Configuration](operations/configuration.md) — dotenvx env files, variables, session/security
  behavior.
- [Validate & CI](operations/validate-and-ci.md) — the quality gate, runtime preflight, tests, and
  org CI standards.
- [Clerk integration](integrations/clerk.md) — the wired auth stack and its glass styling.

The header search (`client/components/Layout/SearchBar.tsx`) filters scaffold pages (Home, Legal,
Sign in, Sign up) via `client/lib/scaffoldSearch.ts`.

# Agent gotchas

- **Node 26+ / pnpm 11+ enforced.** `run-quality-checks.mjs` runs `runtime-preflight.mjs` first; it
  hard-fails on older Node, older pnpm (from `packageManager`), or a broken `better-sqlite3`
  native binding (`pnpm rebuild better-sqlite3`).
- **Env files are selected by `NODE_ENV`.** `server/config.ts` loads `.env.keys` (if present) then
  `.env.<NODE_ENV>`; values already in `process.env` win. `NODE_ENV` is never set inside the env
  files. Encrypted values without `.env.keys` stay encrypted (fatal in production for Clerk keys).
- **Listen ports.** AppBase defaults to **3000**, BudgetPlanner and Codex to **3001**, Armory to
  **3002**. Codex and BudgetPlanner share 3001; set `PORT` if you run both. Dev is two processes:
  Vite `5173` proxies `/api` to Express `3000` (`scripts/dev.mjs`, `vite.config.ts`).
- **Production requires real secrets.** `SESSION_SECRET` must be 32+ chars and Clerk keys must be
  present and decrypted, or startup throws (`server/config.ts`, `server/clerkEnv.ts`). Production
  - `SECURE_COOKIES` without `TRUST_PROXY` also throws (`server/app.ts`).
- **Auth degrades gracefully in dev.** Without Clerk keys, `clerkMiddleware()` is a pass-through
  and every request is unauthenticated; `/api/auth/me` returns 401 and the header hides auth
  controls (`server/auth/middleware.ts`, `client/app/config.ts` `CLERK_ENABLED`).
- **Keep AppBase aligned with siblings.** There is no shared UI npm package; design-token and
  component-class changes must be mirrored into Codex and Armory manually
  ([design system](architecture/design-system.md)).

# Backlog

- **Shell background internals** (`client/lib/asciiBackground/*`, `assets/background*.txt`) — the
  ASCII wave + hex renderers are documented only at the contract level in
  [design system](architecture/design-system.md); the canvas math is deferred.
