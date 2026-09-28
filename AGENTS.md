# AppBase

## Org standards

Dark Avian Labs engineering conventions (README shape, CI/PR runners, validate, release tracks) live in [`docs/org-standards/`](docs/org-standards/). New apps and ports should follow those docs. This file is the design-system contract plus AppBase runtime gotchas.

Defaults: Node **26+**, pnpm **12.x** (`packageManager` must be an exact version, not a dist-tag), `pnpm run validate`, Blacksmith runners with `useblacksmith/checkout@v1` and `pnpm/setup@v2`.

## Overview

AppBase is the starter for Dark Avian Labs web apps. Domain features are empty on purpose. It ships the **DAL design system**: a two-axis theme model (light/dark color mode + UI style), glass-surface components, and shell primitives that sibling apps mirror by hand. There is no shared UI package.

When building a new app from AppBase, copy the design contracts below. Codex and Armory are the live reference implementations. If AppBase and a live app diverge, prefer the patterns documented here and in those apps' `input.css` files.

## Runtime

Default listen port is **3000**. Codex is **3001**, Armory **3002**, BudgetPlanner **3003**, Outfitter **3004**, Sentinel **3005**. Dev is two processes: Vite `5173` proxies `/api` to Express.

The server loads `.env.keys` then `.env.<NODE_ENV>` in-process. `pnpm start` needs `NODE_ENV=production` or it loads the development env file. `pnpm run dev` decrypts `.env.development` with dotenvx before spawning Vite and the API (`scripts/dev.mjs` also forces `SECURE_COOKIES=0` so local HTTP login works). `vite`, `dev:client`, and unwrapped `pnpm run build` still read the env file as text, so encrypting `VITE_*` garbles those. Production requires `SESSION_SECRET` of at least 32 characters, decrypted Clerk keys, and `TRUST_PROXY` if `SECURE_COOKIES` is on.

Empty Clerk keys are fine outside production: `isClerkConfigured()` skips Clerk and treats every request as signed out (Vitest and Playwright rely on this). Placeholder keys (`pk_test_placeholder` / `sk_test_placeholder`) are fatal at boot. Leave both keys empty instead of faking values. Once keys are set, `APP_PUBLIC_BASE_URL` is required. Cursor agents sign in with Clerk Agent Tasks. Do not type a password. Decrypt `.env.development` and read `E2E_CLERK_USER_EMAIL` or `E2E_CLERK_USER_ID`. POST `https://api.clerk.com/v1/agents/tasks` using `CLERK_SECRET_KEY`. Send `agent_name`, `task_description`, `permissions` `*`, `redirect_url` `http://localhost:5173/`, and `on_behalf_of` with `user_id` or `identifier`. Open the URL Clerk returns. The same development user works for AppBase, Codex, Armory, BudgetPlanner, and Outfitter. Local cookies are host-only, so each app origin needs its own task. Do not invent local fake keys. Admin is Clerk public metadata `apps.<APP_ID> === 'admin'`; the Clerk session token must include `"metadata": "{{user.public_metadata}}"`. Production `COOKIE_DOMAIN=.darkavianlabs.com` shares one login across DAL apps; authorization is per-app via `metadata.apps`, not separate Clerk instances.

Add API routes on `apiRouter` above the `/api` 404. `GET /api/version` returns `{ version }` from `package.json` for the stale-client banner. `GET /api/health` is the in-app probe (README / curl). Load balancers should hit `/readyz` (session DB). `/healthz` is process liveness and does not open a session. Sign-in/up routes need `/sign-in/*` and `/sign-up/*` wildcards. Session storage is vendored in `server/db/sqliteSessionStore.ts`; do not swap it for the unmaintained npm package. `bindClerkUserSessionMiddleware` on `/api` regenerates the express session and CSRF token when the Clerk user id changes (anonymous → signed-in, user switch, and sign-out). It skips `/health` and `/version` so probes do not persist sessions. Wrap the route tree in `ErrorBoundary` (`client/components/ui/ErrorBoundary.tsx`).

On Windows, Cursor agent shells may prepend bundled Node 22. After changing Node versions, run `pnpm rebuild better-sqlite3`.

## Theme model

AppBase uses **two independent axes**:

| Axis           | Values                                   | HTML classes                                              | Default |
| -------------- | ---------------------------------------- | --------------------------------------------------------- | ------- |
| **Color mode** | `light` / `dark`                         | `html.dark` (absent = light)                              | `dark`  |
| **UI style**   | `prism` / `shadow` / `clear` / `acrylic` | `html.ui-prism` / `ui-shadow` / `ui-clear` / `ui-acrylic` | `prism` |

**Prism** is the baseline frosted-glass look — no extra CSS block is required beyond base tokens. **Shadow** adds heavier glass and deeper panel shadows. **Clear** removes backdrop blur, uses flat solid surfaces, and shrinks radii via `--radius-ui`. **Acrylic** is the signed-off Windows 11 flyout material (variant D): `blur(40px) saturate(200%) contrast(1.08)`, a 55% tint, exclusion grain, and tiled noise. Do not add `brightness()` to it.

### Boot order (avoid FOUC)

1. `index.html` ships `class="dark ui-prism"` as SSR fallback.
2. `public/theme-init.js` runs synchronously in `<head>` before React — reads cookies/localStorage and applies classes.
3. `ThemeProvider` re-applies on change and persists (skips first write to avoid clobbering pre-hydration state).

### Persistence keys

| Setting    | Cookie           | localStorage     | AppBase fallback     |
| ---------- | ---------------- | ---------------- | -------------------- |
| Color mode | `dal.theme.mode` | `dal.theme.mode` | `appbase.theme.mode` |
| UI style   | `dal.ui.style`   | `dal.ui.style`   | —                    |

Set `VITE_SHARED_THEME_COOKIE_DOMAIN` (e.g. `.darkavianlabs.com`) so theme choices sync across subdomains.

### React API

```ts
import { useTheme } from '@/context/ThemeContext';

const { mode, setMode, toggleMode, uiStyle, setUiStyle, cycleUiStyle } = useTheme();
```

`UI_STYLES`, `UI_STYLE_LABELS`, and `UiStyleSelector` are available for the user-menu style picker.

## CSS architecture

All design tokens and component classes live in **`client/styles/input.css`** (Tailwind v4 with `@theme`, `@layer components`, and style-specific overrides outside layers).

### Key tokens (`@theme` + `:root`)

```
--color-foreground, --color-muted, --color-accent
--color-success, --color-warning, --color-danger, --color-info, --color-unavailable
--color-surface-100 … --color-surface-500
--color-glass, --color-glass-border, --color-glass-border-hover
--color-glass-hover, --color-glass-active, --color-glass-divider
--color-surface-modal, --color-surface-thead
--color-bg-start, --color-bg-end, --color-bg-glow
--shadow-panel
--radius-ui, --radius-ui-lg, --radius-ui-sm   (Clear: 4px / 6px / 3px; Acrylic: 8px / 8px / 4px)
--color-accent-weak, --color-accent-weak-2
--ascii-opacity, --ascii-canvas-fg, --ascii-canvas-fg-bright, --ascii-canvas-fg-accent
--hex-side-fill, --hex-cluster-scale   (4K viewport = 1×)
```

Game-domain scaffold:

- **Hue rarity ladder** (canonical): `--color-rarity-gray`, `-white`, `-green`, `-teal`, `-blue`, `-purple`, `-pink`, `-gold`, `-orange`, `-red`.
- **Domain aliases** (default mapping): `common→gray`, `uncommon→green`, `rare→blue`, `epic→purple`, `legendary→gold`, `mythic→red`, `lord→orange`, `exclusive→red`, `peculiar→pink`. Apps rebind these, they do not invent new hue tokens. Do not point rarity at `--color-danger` / `--color-accent`.
- Damage / riven: `--color-dmg-*`, `--color-riven*`.

`body` uses a fixed gradient (`--color-bg-start` → `--color-bg-end` with `--color-bg-glow` radials). Shell background components sit above that gradient.

### Light mode

`html:not(.dark)` overrides glass, surface, background gradient, and shadow tokens. Use Tailwind's custom dark variant: `@custom-variant dark (&:where(.dark, .dark *));`

### UI style overrides

- **Shadow:** `html.dark.ui-shadow`, `html.ui-shadow:not(.dark)` — token overrides + stronger blur/shadow on `.glass-*`, modals, menus.
- **Clear:** `html.dark.ui-clear`, `html.ui-clear:not(.dark)` — solid surfaces, no `::before` shine, no backdrop-filter, 4px radii.
- **Acrylic:** `html.dark.ui-acrylic`, `html.ui-acrylic:not(.dark)` — Win11 D material on `.glass-*`, modals, menus, and dropdowns. Exclusion lives on `::before`, noise on `::after` (`client/styles/acrylic-noise.svg`). Radii go to 8px / 4px. A parent with `opacity < 1`, `filter`, `mask`, `clip-path`, or its own `backdrop-filter` will kill the blur; Acrylic therefore skips `#root` blur and overlay `backdrop-filter` while a modal is open.

## Component contracts

Use these class names and primitives — do not invent one-off glass or button patterns.

| Area                | Spec                                                                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout max width    | `max-w-[2000px]` on header, main wrapper, and footer. A mobile-first app may use the compact shell instead: `max-w-3xl` on those three regions and an `h-14` header. Keep the feather mark and the `vX.Y.Z` badge either way |
| Glass surfaces      | `glass-surface` (panels/cards), `glass-modal-surface` (dialogs), `glass-shell` (auth shells)                                                                                                                                           |
| Header nav          | `header-link` with `.active` — 40px height, 1rem radius, accent when active                                                                                                                                                            |
| Buttons             | `btn btn-accent`, `btn btn-danger`, `btn btn-cancel` (modal dismiss), `btn btn-secondary`                                                                                                                                              |
| Modals              | `Modal` component with `className` including `glass-modal-surface`; footers use `modal-actions`                                                                                                                                        |
| Dropdowns           | `SelectDropdown` with `triggerClassName` / `placement`; `open` / `onOpenChange` are optional (uncontrolled by default); user-menu triggers use `user-menu-select-trigger`                                                              |
| Stale client banner | `StaleClientUpdateBanner` (`client/components/Layout/StaleClientUpdateBanner.tsx`) + `useStaleBundlePrompt` (polls `/api/version`). CSS: `stale-update-banner` + gold `stale-update-cta` with `stale-update-cta__label` text "Refresh" |
| Toasts              | `Toast` (`client/components/ui/Toast.tsx`) — `.toast-pill` with optional `data-tone="success\|error\|warning"`                                                                                                                         |
| Form focus          | `.form-input:focus` and `.form-group input:focus` — accent border + soft glow ring                                                                                                                                                     |
| Theme on `<html>`   | `dark` + exactly one `ui-prism` / `ui-shadow` / `ui-clear` / `ui-acrylic`                                                                                                                                                              |
| Shell background    | `AsciiWaveBackground` (`.bg-art` canvas) centered; `HexSideBackground` (`.hex-side-panel`) on both sides                                                                                                                               |

### Shell background

The layout renders two fixed background layers behind content (`z-index: 0`), above the body gradient:

1. **`HexSideBackground`** — scattered hex clusters clipped at the left/right edges. Uses theme tokens `--hex-side-fill`. Opacity toggles instantly on a per-hex random schedule (no fade). Scales with viewport; **4K (3840×2160) is 1×** via `--hex-cluster-scale` (`clamp(0.35, min(100vw/3840px, 100vh/2160px), 1)`).
2. **`AsciiWaveBackground`** — canvas diagonal scan wave across ASCII art. Reads `--ascii-canvas-fg`, `--ascii-canvas-fg-bright`, `--ascii-canvas-fg-accent`, and `--ascii-opacity`. Capped at 30fps. Respects `prefers-reduced-motion`. Cascadia Mono is lazy-loaded from `useAsciiBackgroundCanvas` rather than imported in `input.css`.

Assets live in `assets/background.txt` (base frame), `background2.txt` (alt frame), and `background3.txt` (accent mask). Logic is in `client/lib/asciiBackground/` (shared with Codex).

When porting or tuning backgrounds, keep all three ASCII files dimensionally aligned and copy `AsciiWaveBackground`, `HexSideBackground`, and the `.bg-art` / `.hex-side-*` CSS blocks together.

### Modal pattern

```tsx
<Modal open={open} onClose={onClose} className="glass-modal-surface max-w-md">
  <h2>Title</h2>
  {/* body */}
  <div className="modal-actions">
    <Button variant="cancel" onClick={onClose}>
      Cancel
    </Button>
    <Button variant="accent" onClick={onConfirm}>
      Confirm
    </Button>
  </div>
</Modal>
```

`Modal` portals to `document.body`, sets `body.modal-open` (blurs `#root`), and supports nested dialogs via `data-modal-open-count`.

### User menu UI style picker

Place `UiStyleSelector` after primary menu items, separated by `user-menu-divider`:

```tsx
<Menu>
  {/* menu items */}
  <div className="user-menu-divider" role="separator" />
  <UiStyleSelector />
</Menu>
```

## UI primitives (`client/components/ui/`)

| Component         | Purpose                                                      |
| ----------------- | ------------------------------------------------------------ |
| `Button`          | `variant`: `accent` \| `secondary` \| `danger` \| `cancel`   |
| `Input`           | Wraps `.form-input`                                          |
| `GlassCard`       | `<section className="glass-surface">`                        |
| `Modal`           | Accessible dialog with overlay + body blur                   |
| `Menu`            | User dropdown shell (`glass-surface` + positioning)          |
| `SelectDropdown`  | Accessible custom select (portaled menu)                     |
| `Toast`           | `.toast-pill` status message (`data-tone`, optional dismiss) |
| `ErrorBoundary`   | Top-level render-crash shell with a Reload button            |
| `UiStyleSelector` | Theme style picker for user menu                             |
| `MaterialSymbol`  | Material Symbols Rounded icon span                           |

## Clerk authentication styling

AppBase ships [Clerk](https://clerk.com/docs/references/react/overview) authentication **wired by default**: `@clerk/express` middleware + `/api/auth/me` on the server (`server/auth/`), `ClerkProvider`/`AuthProvider`/`ProtectedRoute` and sign-in/up pages on the client (`client/features/auth/`), and `@/clerk/clerk-auth.css` imported in `main.tsx`. Without Clerk keys the app runs unauthenticated (dev convenience); production requires keys. The `client/clerk/` folder holds the appearance layer.

### Files (`client/clerk/`)

| File                 | Purpose                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `clerk-auth.css`     | Glass-themed overrides for Clerk sign-in/up and profile modals (Prism / Shadow / Clear / Acrylic aware)       |
| `clerkAppearance.ts` | `buildClerkAppearance()` and `buildClerkProfileAppearance()` — maps Clerk `appearance` API to DAL CSS classes |
| `ClerkAuthShell.tsx` | Auth page wrapper: `glass-surface` card + `clerk-auth-shell` + title/subtitle                                 |
| `index.ts`           | Barrel exports                                                                                                |

### Wiring conventions

1. Configure `VITE_CLERK_PUBLISHABLE_KEY` / server `CLERK_SECRET_KEY` (empty = auth disabled outside production).
2. Clerk styles load **after** the main design system CSS in `main.tsx`:

   ```ts
   import './styles/input.css';
   import '@/clerk/clerk-auth.css';
   ```

3. Sign-in/up routes wrap Clerk components with `ClerkAuthShell` and pass `appearance={buildClerkAppearance(mode)}` from `useTheme()` (see `client/features/auth/SignInPage.tsx`).
4. For the account profile modal / `UserButton`, pass `appearance: buildClerkProfileAppearance(mode)`.

### Sign-in page pattern

```tsx
import { SignIn } from '@clerk/react';
import { ClerkAuthShell, buildClerkAppearance } from '@/clerk';
import { useTheme } from '@/context/ThemeContext';

export function SignInPage() {
  const { mode } = useTheme();

  return (
    <ClerkAuthShell title="Sign in" subtitle="Use your Dark Avian Labs account.">
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        appearance={buildClerkAppearance(mode)}
      />
    </ClerkAuthShell>
  );
}
```

### Profile modal (header user menu)

```tsx
clerk.openUserProfile({
  appearance: buildClerkProfileAppearance(mode),
});
```

Clerk styling reads the same CSS variables and `html.dark` / `html.ui-*` classes as the rest of the app — no separate Clerk theme config is required beyond the appearance builders.

## Porting to a new app

### Default (Prism only)

If you only need the default look:

1. Copy `client/styles/input.css` (or import from a shared package if you extract one later).
2. Copy `public/theme-init.js`, `client/context/ThemeContext.tsx`, and wire `ThemeProvider` in `main.tsx`.
3. Set `index.html` to `class="dark ui-prism"` and include `theme-init.js` in `<head>`.
4. Use the component class names above; default UI style requires no extra CSS.

### All themes (Prism + Shadow + Clear + Acrylic)

Also ensure:

- Full `input.css` includes `html.ui-shadow`, `html.ui-clear`, and `html.ui-acrylic` token blocks and component overrides at the bottom of the file.
- `client/styles/acrylic-noise.svg` sits next to `input.css` (Acrylic tiles it at 128px).
- `ThemeContext` exposes `uiStyle` / `setUiStyle` (`prism`, `shadow`, `clear`, `acrylic`).
- `UiStyleSelector` in the user menu (or equivalent settings surface).
- Fonts: latin-subset `@font-face` for Inter / Geist / Geist Mono in `input.css`; keep Material Symbols as `@import`; Cascadia Mono is lazy-loaded by the ASCII canvas hook (`@fontsource-variable/cascadia-mono`).
- Shell backgrounds: `AsciiWaveBackground`, `HexSideBackground`, `assets/background*.txt`, and `client/lib/asciiBackground/`.

### Clerk

Copy `client/clerk/`, `client/features/auth/`, and `server/auth/`, and import `@/clerk/clerk-auth.css` in `main.tsx`. See **Clerk authentication styling** above.

### Staying aligned with Codex / Armory

There is **no shared UI npm package** today. When you change tokens, glass behavior, or component classes in AppBase, apply the same change in Codex (`packages/core/src/input.css`) and Armory (`client/styles/input.css`) manually.

Checklist after design changes:

- [ ] Token values match across apps (oklch color space)
- [ ] `dal.theme.mode` / `dal.ui.style` cookie keys unchanged
- [ ] `theme-init.js` logic matches (minus app-specific localStorage fallback keys), including `acrylic` in the UI style list
- [ ] `acrylic-noise.svg` copied next to `input.css` if Acrylic is enabled
- [ ] Modal, dropdown, and button class names unchanged
- [ ] Layout width is `max-w-[2000px]`, or the compact `max-w-3xl` shell when the app is mobile-first
- [ ] Shell background assets and `asciiBackground` lib kept in sync with Codex when wave behavior changes
- [ ] `--hex-cluster-scale` reference viewport (3840×2160) unchanged unless intentionally retuning side hex size

## Scripts

See `README.md` for `pnpm run build`, `pnpm start`, `pnpm run validate`, etc.

Quality checks use **oxlint** (lint) and **oxfmt** (format). Run `pnpm run validate` before committing — it runs runtime preflight, formatting, lint, typecheck, and tests in sequence via `run-quality-checks.mjs`.

Node >= 26 and pnpm >= 12 required (`package.json` `engines` / `packageManager`).

## Tests

`pnpm run validate` is the quality gate: preflight, oxfmt, oxlint, typecheck, Vitest. In CI that Vitest step is instrumented (`pnpm run test:coverage`); locally `pnpm test` stays uninstrumented. Use `pnpm run test:watch` while iterating.

HTTP tests that need the real stack (health, CSRF, Helmet, `/api/version`) go through `createApp()` in `server/app.ts` (`server/app.test.ts`). `createApp` already injects an in-memory session DB in tests; do not add extra HTTP route suites for the same probes. `server/index.ts` only opens the session store then listens.

Vitest is Node-only (`*.test.ts`). Do not add happy-dom or `*.test.tsx` until there is a real component test.

Playwright (`pnpm run test:e2e`) is **not** inside validate. It boots the compiled server (`dist/server/index.js`) on port **3100** with a throwaway session sqlite file and hits Chromium smokes (probes, CSRF, API 404, SPA served when `dist/client` exists). Run `pnpm run build` first, and `pnpm run test:e2e:install` once per machine. The runner and browser downloads are Apache-2.0 / free; no cloud grid.

Empty Clerk keys keep `isClerkConfigured()` false so Vitest and Playwright run signed out. Do not invent local fake keys.
