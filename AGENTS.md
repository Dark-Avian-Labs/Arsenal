# AppBase

## Org standards

Dark Avian Labs engineering conventions (README shape, CI/PR runners, validate, OpenWiki, release tracks) live in [`docs/org-standards/`](docs/org-standards/). New apps and ports should follow those docs; this file focuses on the **design system**.

Defaults: Node **26+**, pnpm **11.x**, `pnpm run validate`, OKF OpenWiki under `openwiki/`, Blacksmith runners with `useblacksmith/checkout@v1` and `actions/setup-node@v7`.

## OpenWiki

This repository has documentation located in the /openwiki directory.

Start here:

- [OpenWiki quickstart](openwiki/quickstart.md)

OpenWiki includes repository overview, architecture notes, workflows, domain concepts, operations, integrations, testing guidance, and source maps.

When working in this repository, read the OpenWiki quickstart first, then follow its links to the relevant architecture, workflow, domain, operation, and testing notes.

## Overview

AppBase is the shared starter for Dark Avian Labs web apps (Codex, Armory, and new projects). It ships the **DAL design system**: a two-axis theme model (light/dark color mode + UI style), glass-surface components, and shell primitives that sibling apps mirror manually.

When building a new app from AppBase, copy the design contracts below so the UI stays consistent across the ecosystem. Codex and Armory are the reference implementations — if AppBase and a live app diverge, prefer the patterns documented here and in those apps' `input.css` files.

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

| Area                | Spec                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Layout max width    | `max-w-[2000px]` on header, main wrapper, and footer                                                      |
| Glass surfaces      | `glass-surface` (panels/cards), `glass-modal-surface` (dialogs), `glass-shell` (auth shells)              |
| Header nav          | `header-link` with `.active` — 40px height, 1rem radius, accent when active                               |
| Buttons             | `btn btn-accent`, `btn btn-danger`, `btn btn-cancel` (modal dismiss), `btn btn-secondary`                 |
| Modals              | `Modal` component with `className` including `glass-modal-surface`; footers use `modal-actions`           |
| Dropdowns           | `SelectDropdown` with `triggerClassName` / `placement`; user-menu triggers use `user-menu-select-trigger` |
| Stale client banner | `stale-update-banner` + gold `stale-update-cta` with `stale-update-cta__label` text "Refresh"             |
| Toasts              | `.toast-pill` with optional `data-tone="success\|error\|warning"`                                         |
| Form focus          | `.form-input:focus` and `.form-group input:focus` — accent border + soft glow ring                        |
| Theme on `<html>`   | `dark` + exactly one `ui-prism` / `ui-shadow` / `ui-clear` / `ui-acrylic`                                 |
| Shell background    | `AsciiWaveBackground` (`.bg-art` canvas) centered; `HexSideBackground` (`.hex-side-panel`) on both sides  |

### Shell background

The layout renders three fixed background layers behind content (`z-index: 0`):

1. **`HexSideBackground`** — scattered hex clusters clipped at the left/right edges. Uses theme tokens `--hex-side-fill`. Opacity toggles instantly on a per-hex random schedule (no fade). Scales with viewport; **4K (3840×2160) is 1×** via `--hex-cluster-scale` (`clamp(0.35, min(100vw/3840px, 100vh/2160px), 1)`).
2. **`AsciiWaveBackground`** — canvas diagonal scan wave across ASCII art. Reads `--ascii-canvas-fg`, `--ascii-canvas-fg-bright`, `--ascii-canvas-fg-accent`, and `--ascii-opacity`. Respects `prefers-reduced-motion`.

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

| Component         | Purpose                                                    |
| ----------------- | ---------------------------------------------------------- |
| `Button`          | `variant`: `accent` \| `secondary` \| `danger` \| `cancel` |
| `Input`           | Wraps `.form-input`                                        |
| `GlassCard`       | `<section className="glass-surface">`                      |
| `Modal`           | Accessible dialog with overlay + body blur                 |
| `Menu`            | User dropdown shell (`glass-surface` + positioning)        |
| `SelectDropdown`  | Accessible custom select (portaled menu)                   |
| `UiStyleSelector` | Theme style picker for user menu                           |
| `MaterialSymbol`  | Material Symbols Rounded icon span                         |

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
- Font packages: `@fontsource-variable/geist`, `geist-mono`, `inter`, `material-symbols-rounded`, `cascadia-mono` (ASCII canvas).
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
- [ ] Layout `max-w-[2000px]` preserved
- [ ] Shell background assets and `asciiBackground` lib kept in sync with Codex when wave behavior changes
- [ ] `--hex-cluster-scale` reference viewport (3840×2160) unchanged unless intentionally retuning side hex size

## Scripts

See `README.md` for `pnpm run build`, `pnpm start`, `pnpm run validate`, etc.

Quality checks use **oxlint** (lint) and **oxfmt** (format). Run `pnpm run validate` before committing — it runs runtime preflight, formatting, lint, typecheck, and tests in sequence via `run-quality-checks.mjs`.

Node >= 26 and pnpm >= 11 required (`package.json` `engines` / `packageManager`).
