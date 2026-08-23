---
type: Integration
title: Clerk Authentication
description: The wired Clerk auth stack — server middleware and roles, client provider and protected routes, and the glass-themed appearance layer.
tags: [integration, clerk, auth, styling]
timestamp: 2026-08-23T01:30:00Z
---

# Overview

AppBase ships [Clerk](https://clerk.com/docs/references/react/overview) authentication **wired end
to end**, degrading gracefully when keys are absent: without `CLERK_SECRET_KEY` +
`VITE_CLERK_PUBLISHABLE_KEY` the server middleware is a pass-through, every request is treated as
unauthenticated, and the client hides all auth UI (`CLERK_ENABLED` in `client/app/config.ts`).
Production refuses to start without keys (`server/clerkEnv.ts`).

# Server side

- `server/auth/middleware.ts` — `clerkMiddleware()` (real `@clerk/express` middleware with
  `authorizedParties` when configured), `getClerkAuthState`, `requireAuthApi`, `requireAdmin`.
- `server/auth/clerk.ts` — org role convention: the Clerk session token carries
  `metadata.apps` (from user public metadata) mapping app IDs to roles; `isAppAdmin` checks
  `metadata.apps[APP_ID] === 'admin'`. Configure the session token template in the Clerk
  dashboard with `"metadata": "{{user.public_metadata}}"`.
- `server/auth/clerkAuthorizedParties.ts` — allowed `azp` origins (`APP_PUBLIC_BASE_URL`,
  `ALLOWED_APP_ORIGINS`, localhost dev ports outside production).
- `server/http/helmetCsp.ts` — CSP extended for the Clerk FAPI origin (default
  `https://clerk.darkavianlabs.com`, override via `CLERK_FAPI_URL`), `img.clerk.com`, and
  Cloudflare Turnstile.
- `server/routes/auth.ts` — `GET /api/auth/me` behind `requireAuthApi`.

# Client side

- `client/App.tsx` — mounts `ClerkProvider` + `AuthProvider` when enabled, otherwise
  `DisabledAuthProvider` (always signed out).
- `client/features/auth/AuthContext.tsx` — mirrors the server's session view via `/api/auth/me`
  (`status`, `userId`, `isAdmin`); clears the cached CSRF token on sign-out.
- `client/features/auth/ProtectedRoute.tsx` — redirects to sign-in (optionally requires admin).
- `client/features/auth/SignInPage.tsx` / `SignUpPage.tsx` — Clerk components inside
  `ClerkAuthShell` at `/sign-in/*` and `/sign-up/*` (path routing needs the route wildcard).
- `client/features/auth/AuthControls.tsx` — header "Sign in" link / `UserButton`, rendered by
  `Layout` only when `CLERK_ENABLED`.
- `client/utils/api.ts` — `apiFetch` attaches the CSRF token and retries once with a fresh token
  when the server answers `403` + `X-CSRF-Error`.

# Appearance layer

Files under `client/clerk/` glass-theme all Clerk surfaces to the
[DAL design system](../architecture/design-system.md):

| File                 | Purpose                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `clerk-auth.css`     | Glass-themed overrides for Clerk sign-in/up and profile modals (Prism/Shadow/Clear/Acrylic aware).        |
| `clerkAppearance.ts` | `buildClerkAppearance()` / `buildClerkProfileAppearance()` — map Clerk's `appearance` API to DAL classes. |
| `ClerkAuthShell.tsx` | Auth page wrapper: `glass-surface` card + `clerk-auth-shell` + title/subtitle.                            |
| `index.ts`           | Barrel exports.                                                                                           |

`clerk-auth.css` is imported in `client/main.tsx` **after** `styles/input.css` so design-system
tokens are available to override. Because the overrides read the same CSS variables and
`html.dark` / `html.ui-*` classes as the rest of the app, Clerk UIs follow the active theme with no
separate Clerk theme config.

# Where to start

- `server/auth/middleware.ts` and `client/features/auth/AuthContext.tsx` — the two glue points
- `.env.example` — the Clerk env vars ([configuration](../operations/configuration.md))
- Root `AGENTS.md` → "Optional: Clerk authentication styling" for the appearance patterns

# What to watch out for

- **Import order matters:** Clerk CSS must load after `input.css`, or design-system tokens won't
  be available to override.
- **Placeholder Clerk keys make the middleware throw on every request** (500s) — leave the keys
  empty in dev instead of using fake values.
- **`APP_PUBLIC_BASE_URL` is required once keys are set** — `getClerkAuthorizedParties()` throws
  without it.
- **Shared login is org policy:** production `COOKIE_DOMAIN=.darkavianlabs.com` plus one Clerk
  instance means all DAL apps share a session; per-app authorization happens via the
  `metadata.apps` role claim, not separate logins.
