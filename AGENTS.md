# Arsenal

Dark Avian Labs web apps live in this repo. The shell is `@dark-avian-labs/ui`. The HTTP stack is `@dark-avian-labs/server-kit`. Change them once. App-specific screens stay in that app.

CI conventions live in `docs/org-standards/`.

## Ports

| App            | Dev server | Signed-out e2e | Signed-in e2e | PM2 name      |
| -------------- | ---------- | -------------- | ------------- | ------------- |
| _template      | 3000       | 3100           | 4100          | not deployed  |
| Codex          | 3001       | 3101           | 4101          | Codex         |
| Armory         | 3002       | 3102           | 4102          | Armory        |
| Budget Planner | 3003       | 3103           | 4103          | BudgetPlanner |
| Outfitter      | 3004       | 3104           | 4104          | Outfitter     |
| Sentinel       | 3005       | 3105           | none          | Sentinel      |

Vite proxies `/api` to Express.

## Commands

Run these from the repo root.

`pnpm --filter <app> dev` starts that app. Armory and Codex start only the API. Their Vite client is `pnpm --filter <app> dev:client`. Budget Planner, Outfitter, Sentinel, and the template start the API and Vite together.

`pnpm run validate` is preflight, oxfmt, oxlint, typecheck, then Vitest. Playwright is outside validate. `pnpm run build` builds every package that has a build script. `pnpm --filter <app> start` runs `node server/index.ts`.

Node 26. pnpm 12.10.1, pinned by `packageManager`. On Windows, after a Node change, run `pnpm rebuild better-sqlite3`.

## Environment

The server loads `.env.keys`, then `.env.<NODE_ENV>`. `pnpm --filter <app> start` loads the development env unless `NODE_ENV=production`. Leave `VITE_*` plaintext. Encrypting them garbles Vite. Production needs `TRUST_PROXY` when `SECURE_COOKIES` is on.

## Auth

Empty Clerk keys outside production mean signed out. `isClerkConfigured()` is false, and Vitest and the signed-out Playwright project rely on that. Placeholder keys are fatal: `pk_test_placeholder`, `sk_test_placeholder`, and bare `pk_test_` / `sk_test_` prefixes. Leave both keys empty. Do not invent local fake keys. The signed-in Playwright project loads `.env.development` when `E2E_CLERK_USER_EMAIL` is set. It stays unregistered and prints a warning when that email is missing, `.env.development` cannot be decrypted, or the `pk_test_` / `sk_test_` keys are missing. The rest of the suite still passes. Once keys are set, `APP_PUBLIC_BASE_URL` is required. Admin is Clerk public metadata `apps.<APP_ID> === 'admin'`. The session token must include `"metadata": "{{user.public_metadata}}"`. Production `COOKIE_DOMAIN=.darkavianlabs.com` shares one login. Authorization stays per app. `isAdmin` is optional. Some apps have no admin role.

Writes on `/api` need an `Authorization: Bearer` header. GET, HEAD, and OPTIONS can use the Clerk cookie. A cross-site POST returns 403.

Agents sign in with Clerk Agent Tasks. Decrypt `.env.development` and read `E2E_CLERK_USER_ID`. Email and password are the Forgejo secrets `E2E_CLERK_USER_EMAIL` and `E2E_CLERK_USER_PASSWORD`. POST `https://api.clerk.com/v1/agents/tasks` with `CLERK_SECRET_KEY`. Send `agent_name`, `task_description`, `permissions` `*`, `redirect_url` for that app's Vite origin, and `on_behalf_of` with `user_id` or `identifier`. Open the URL Clerk returns. The same development user works for the template, Codex, Armory, Budget Planner, and Outfitter. Cookies are host-only, so each origin needs its own task.

## Versions and deploy

Each app keeps its version in `apps/<app>/package.json`. The released version is the git tag `<app>-vX.Y.Z`, for example `armory-v1.74.5`. A push to `main` that changes an app bumps that tag from conventional commits and creates the next tag. The monorepo tag `v1.0.0` stays put.

The deploy writes `release.json` with `version`, `sha`, and `builtAt`. The server reports that version from `APP_VERSION` or `release.json`. A build without `APP_VERSION` shows `0.0.0-dev` in the client.

On the host, `SERVER_PATH` contains `data/`, `.env.keys`, `releases/<version>/`, and `current` pointing at the release. Each release links `data` and `.env.keys` back to those shared files. PM2 runs `server/index.ts` with its working directory set to `current`.

## Shell

Two axes. Color mode is `light` or `dark`, class `html.dark`, default dark. UI style is `prism`, `shadow`, `clear`, or `acrylic`, default prism. Shared cookies are `dal.theme.mode` and `dal.ui.style`. An app may also keep a local fallback key. `public/theme-init.js` runs before React. `VITE_SHARED_THEME_COOKIE_DOMAIN` syncs the choice across subdomains.

Acrylic is the signed-off Windows 11 flyout: `blur(40px) saturate(200%) contrast(1.08)`, a 55% tint, exclusion grain, and tiled noise. Do not add `brightness()`. A parent with opacity below 1, or with `filter`, `mask`, `clip-path`, or its own `backdrop-filter`, kills the blur. Acrylic skips `#root` blur and the overlay `backdrop-filter` while a modal is open.

Layout width is `max-w-[2000px]` on the header, main, and footer. A mobile-first app may use `max-w-3xl` and an `h-14` header. Keep the feather mark and the `vX.Y.Z` badge either way.

Use the classes and components in `@dark-avian-labs/ui`. Game-domain colors `--color-dmg-*` and `--color-riven*` belong in Armory.

The shell background is `HexSideBackground` plus `AsciiWaveBackground`. 4K is 1× for `--hex-cluster-scale`. Cascadia Mono Variable loads from the canvas hook.

## Tests

HTTP tests go through `createApp()`. In development the API does not serve the SPA. Test and production serve `dist/client` when `index.html` exists, and return 503 when it does not.
