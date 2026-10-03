# AppBase

AppBase is the starter for Dark Avian Labs web apps. There is no shared UI package. Copy the shell by hand. Codex and Armory are the live apps. If this file and a live app disagree on the shell, follow this file.

Org conventions live in `docs/org-standards/`.

## Shared across apps

Ports: AppBase 3000, Codex 3001, Armory 3002, BudgetPlanner 3003, Outfitter 3004, Sentinel 3005. Vite proxies `/api` to Express. Signed-out Playwright uses 3100 for AppBase, 3101 Codex, 3102 Armory, 3103 BudgetPlanner, 3104 Outfitter, and 3100 again for Sentinel. Signed-in Playwright uses 4100 through 4104 for AppBase, Codex, Armory, BudgetPlanner, and Outfitter. Sentinel has no signed-in project.

Node 26+, pnpm 12.x, exact `packageManager`. Corepack rejects dist-tags. `pnpm run validate` is preflight, oxfmt, oxlint, typecheck, then Vitest. CI runs `test:coverage`. Playwright is outside validate. On Windows, Cursor shells may prepend Node 22. After a Node change, run `pnpm rebuild better-sqlite3`.

The server loads `.env.keys`, then `.env.<NODE_ENV>`. `pnpm start` loads the development env unless `NODE_ENV=production`. Leave `VITE_*` plaintext. Encrypting them garbles Vite. Production needs `SESSION_SECRET` of at least 32 characters, and `TRUST_PROXY` when `SECURE_COOKIES` is on.

Empty Clerk keys outside production mean signed out. `isClerkConfigured()` is false, and Vitest and the signed-out Playwright project rely on that. Placeholder keys are fatal: `pk_test_placeholder`, `sk_test_placeholder`, and bare `pk_test_` / `sk_test_` prefixes. Leave both keys empty. Do not invent local fake keys. The signed-in Playwright project loads `.env.development` when `E2E_CLERK_USER_EMAIL` is set. It stays unregistered and prints a warning when that email is missing, `.env.development` cannot be decrypted, or the `pk_test_` / `sk_test_` keys are missing. The rest of the suite still passes. Once keys are set, `APP_PUBLIC_BASE_URL` is required. Admin is Clerk public metadata `apps.<APP_ID> === 'admin'`. The session token must include `"metadata": "{{user.public_metadata}}"`. Production `COOKIE_DOMAIN=.darkavianlabs.com` shares one login. Authorization stays per app. `isAdmin` is optional. Some apps have no admin role.

Agents sign in with Clerk Agent Tasks. Decrypt `.env.development` and read `E2E_CLERK_USER_ID`. Email and password are the Forgejo secrets `E2E_CLERK_USER_EMAIL` and `E2E_CLERK_USER_PASSWORD`. POST `https://api.clerk.com/v1/agents/tasks` with `CLERK_SECRET_KEY`. Send `agent_name`, `task_description`, `permissions` `*`, `redirect_url` for that app's Vite origin, and `on_behalf_of` with `user_id` or `identifier`. Open the URL Clerk returns. The same development user works for AppBase, Codex, Armory, BudgetPlanner, and Outfitter. Cookies are host-only, so each origin needs its own task.

Session storage is `server/db/sqliteSessionStore.ts`. Do not replace it with the npm package. `bindClerkUserSessionMiddleware` regenerates the session and CSRF token when the Clerk user id changes. It skips `/health` and `/version`.

`createApp()` in `server/app.ts` is the HTTP stack. `server/index.ts` opens stores and listens. Add routes on `apiRouter` above the `/api` 404. `/healthz` is process liveness. `/readyz` checks the session DB. `GET /api/health` is the in-app probe. `GET /api/version` feeds the stale-client banner.

Sign-in routes need `/sign-in/*` and `/sign-up/*`. A signed-out protected page stays in the shell and returns to the page that was requested. Armory stays readable while signed out.

The legal footer URL is `https://darkavianlabs.com/legal` unless the env overrides it.

## Shell

Two axes. Color mode is `light` or `dark`, class `html.dark`, default dark. UI style is `prism`, `shadow`, `clear`, or `acrylic`, default prism. Shared cookies are `dal.theme.mode` and `dal.ui.style`. An app may also keep a local fallback key such as `appbase.theme.mode`. `public/theme-init.js` runs before React. `VITE_SHARED_THEME_COOKIE_DOMAIN` syncs the choice across subdomains.

Acrylic is the signed-off Windows 11 flyout: `blur(40px) saturate(200%) contrast(1.08)`, a 55% tint, exclusion grain, and tiled noise. Do not add `brightness()`. A parent with opacity below 1, or with `filter`, `mask`, `clip-path`, or its own `backdrop-filter`, kills the blur. Acrylic skips `#root` blur and the overlay `backdrop-filter` while a modal is open.

Layout width is `max-w-[2000px]` on the header, main, and footer. A mobile-first app may use `max-w-3xl` and an `h-14` header. Keep the feather mark and the `vX.Y.Z` badge either way.

Use the classes in `client/styles/input.css` and the components in `client/components/ui/`. Do not invent a second glass or button style. Game-domain colors `--color-dmg-*` and `--color-riven*` belong in Armory, not the template.

The shell background is `HexSideBackground` plus `AsciiWaveBackground`. 4K is 1× for `--hex-cluster-scale`. Cascadia Mono loads from the canvas hook, not from `input.css`.

When the shell changes here, copy it to the sibling apps by hand.

## Tests

Vitest here is Node-only. Do not add happy-dom or `*.test.tsx` until there is a real component test. HTTP tests go through `createApp()`. In development the API does not serve the SPA. Test and production serve `dist/client` when `index.html` exists, and return 503 when it does not. Signed-out Playwright uses port 3100 after `pnpm run build`. Signed-in Playwright uses port 4100 and builds the client into `dist/e2e-client`. `pnpm run build` still writes `dist/client`.
