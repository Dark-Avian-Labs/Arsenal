# Monorepo migration plan

Source: `AUDIT-2026-10-09.html` (same file in every repo root). This plan executes every finding in that audit in one pass, with these owner decisions applied:

- DAL-ARCH-01: option A, one monorepo.
- DAL-CLI-01: import the SVGs we use directly, no icon library, no Vite plugin. `style-src 'unsafe-inline'` stays (Clerk needs it); document that it is the only remaining reason.
- DAL-CLI-02: the owner provides `favicon.svg` per Codex game before this runs. Assume they exist.
- DAL-DEP-05: upgrade BudgetPlanner to `@dnd-kit/react` as part of this.
- DAL-CI-04 / DAL-CI-05: keep the public images, no self-maintained image. IPv6 is disabled on the runner host (pending reboot), so the Playwright DNS shim is deleted, not replaced.
- DAL-CI-07: the `light` label exists. Keep it for the gate job.
- DAL-OPS-01: PM2 stays. No containers.

The plan is written for an executing model that has not read the audit. Every stage says what to do, which files to touch, how to verify, and when to stop and ask. Do not skip the verification gates.

---

## 0. Rules for the executing model

1. **Forgejo is the source of truth.** Remote `forgejo` = `https://git.darkavianlabs.com/Dark-Avian-Labs/<repo>.git`. GitHub is a push mirror; never push there. Never push to `main`; open pull requests. The `fj` CLI is authenticated: `fj -H git.darkavianlabs.com -C <dir> pr create -r Dark-Avian-Labs/<repo> --base main --head <branch>`.
2. **Work in the new repo on a branch.** All stages happen in the new `Arsenal` repo (Stage 0) on branch `migration`. The six old repos are not touched until the cutover checklist (Section 12).
3. **Node 26, pnpm 12.9.1 exactly.** `node -v` must print `v26.*`. `pnpm -v` must print `12.9.1`. If a Cursor shell prepends Node 22, fix the PATH first. After any Node change run `pnpm rebuild better-sqlite3`.
4. **One stage, one commit (or a few).** Commit message style is conventional commits: `feat:`, `fix:`, `chore:`, `ci:`, `refactor:`, `docs:`. Scope in parentheses is optional (`refactor(server-kit): ...`).
5. **Verification gates are mandatory.** Each stage ends with a gate. If the gate fails, fix it before moving on. Do not comment out tests to make a gate pass.
6. **Stop and ask when:** a file in two apps differs in a way this plan does not explain how to resolve and the difference is not obviously app-specific; a secret value is needed; a server command is needed (you do not have SSH access; the owner runs Section 12); an npm package named here does not exist or has a different API than described.
7. **Do not invent.** Where this plan gives code, use it verbatim. Where it gives a file list, use exactly that list. Where it says "move", use `git mv` so history follows.
8. **Windows note.** The workspace is `D:\Development\Dark Avian Labs`. PowerShell has no heredocs; write files with the editor tool. Git commands below work unchanged in PowerShell.
9. **No `permissions:` block** in any `.forgejo/workflows/*.yml`. Forgejo ignores it and warns.
10. **Runner labels are exactly:** `build-node26`, `light-node26`, `light`. Do not invent others.

---

## 1. Target state

### 1.1 Repository

New Forgejo repo `Dark-Avian-Labs/Arsenal` (private), default branch `main`, GitHub push mirror `github.com/Dark-Avian-Labs/Arsenal`. If the owner prefers another name, it is a find-and-replace of `Arsenal` in this file.

### 1.2 Tree

```
Arsenal/
  .forgejo/workflows/
    pr.yml              # validate + build + e2e on every pull request
    deploy.yml          # on push to main: detect changed apps, call _deploy-app per app
    _deploy-app.yml     # reusable: version, build, pnpm deploy, upload, switch, verify, release
    dependencies.yml    # Sayori
    security.yml        # pnpm audit + gate
  .npmrc                # (none needed; kept empty on purpose unless a registry is added)
  .oxfmtrc.json
  .oxlintrc.json
  AGENTS.md
  package.json          # workspace root: scripts only, no app code
  pnpm-workspace.yaml   # packages + catalog + allowBuilds
  pnpm-lock.yaml
  run-quality-checks.mjs
  vitest.config.ts      # test.projects = apps/* and packages/*
  scripts/
    ci/changes.mjs      # which apps changed between two SHAs
    ci/release.mjs      # next version + notes for one app from conventional commits
    ci/deploy.sh        # upload tarball, switch symlink, verify, prune
    dependency-update.mjs
    runtime-preflight.mjs
    icons/sync.mjs      # generate packages/ui/src/icons.generated.ts from @material-symbols/svg-400
  packages/
    config/             # tsconfig.base.json, tsconfig.server.json, tsconfig.client.json, vitest.base.ts, playwright.base.ts
    server-kit/         # Express stack, auth, helmet, logger, config helpers, sqlite helpers (compiled to dist/)
    ui/                 # React shell: Layout, ui components, theme, clerk shell, api client, icons, styles (source, no build)
    sentinel-agent/     # moved from Sentinel/packages/agent (compiled to dist/)
  apps/
    _template/          # what AppBase is today minus everything that moved to packages/; not deployed
    armory/
    budget-planner/
    codex/
    sentinel/
    outfitter/
```

Each app keeps its own `.env.development`, `.env.production`, `.env.example`, `.env.keys` (gitignored), `index.html`, `public/`, `client/`, `server/`, `shared/`, `e2e/`, `playwright.config.ts`, `vitest.config.ts`, `vite.config.ts`, `tsconfig*.json`, `package.json`, `ecosystem.config.cjs`.

### 1.3 Package names

| Directory | package.json name |
| --- | --- |
| `packages/server-kit` | `@dark-avian-labs/server-kit` |
| `packages/ui` | `@dark-avian-labs/ui` |
| `packages/config` | `@dark-avian-labs/config` |
| `packages/sentinel-agent` | `@dark-avian-labs/sentinel-agent` |
| `apps/armory` | `armory` |
| `apps/budget-planner` | `budget-planner` |
| `apps/codex` | `codex` |
| `apps/sentinel` | `sentinel` |
| `apps/outfitter` | `outfitter` |
| `apps/_template` | `dal-template` |

### 1.4 Ports (unchanged)

| App | Dev server | Signed-out e2e | Signed-in e2e | PM2 name |
| --- | --- | --- | --- | --- |
| _template | 3000 | 3100 | 4100 | (not deployed) |
| codex | 3001 | 3101 | 4101 | Codex |
| armory | 3002 | 3102 | 4102 | Armory |
| budget-planner | 3003 | 3103 | 4103 | BudgetPlanner |
| outfitter | 3004 | 3104 | 4104 | Outfitter |
| sentinel | 3005 | 3105 | (none) | Sentinel |

Sentinel's signed-out e2e port moves from 3100 to 3105 so all suites can run in one job.

### 1.5 Server layout per app (new)

`SERVER_PATH_<APP>` is the existing per-app directory on the host. After migration it contains:

```
<SERVER_PATH>/
  data/                 # persistent, never touched by deploys (already exists today)
  .env.keys             # written by deploy, mode 600 (already exists today)
  releases/<version>/   # one directory per deployed version; keep last 3
  current -> releases/<version>   # symlink; PM2 cwd
```

Each release directory contains `data -> ../../data` and `.env.keys -> ../../.env.keys` symlinks so the app code needs no path changes.

### 1.6 Secrets in the new repo

Shared (one each): `SSH_PRIVATE_KEY`, `SERVER_KNOWN_HOST`, `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_PORT`, `DISCORD_WEBHOOK`, `DISCORD_USERID`, `SAYORI_TOKEN`, `E2E_CLERK_USER_EMAIL`, `E2E_CLERK_USER_PASSWORD`.

Per app, suffix in `ARMORY`, `BUDGET_PLANNER`, `CODEX`, `SENTINEL`, `OUTFITTER`:
`DOTENV_PRIVATE_KEY_PRODUCTION_<APP>`, `DOTENV_PRIVATE_KEY_DEVELOPMENT_<APP>`, `SERVER_PATH_<APP>`.

Sentinel has no `DOTENV_PRIVATE_KEY_DEVELOPMENT_SENTINEL` need (no signed-in e2e); create it anyway for symmetry if the value exists.

Gone: `CI_PAT` (no bot pushes to main any more).

### 1.7 Runner images (DAL-CI-04 answer)

| Label | Image | Verdict |
| --- | --- | --- |
| `build-node26` | `docker.io/library/node:26-bookworm` | Keep. Official, has git, curl, openssh-client. Do not switch to `-slim` (no git, breaks checkout). |
| `light-node26` | `docker.io/library/node:26-alpine3.23` | Keep. Needs `apk add git` before checkout (already done). |
| `light` | `docker.io/library/alpine:3.23` | Keep for the `security` gate job. |
| `build`, `build-docker` | ubuntu / catthehacker | Not used by these apps. Leave alone. |

There is no public image with Node 26 plus pnpm plus Chromium system libraries; the Microsoft Playwright images ship Node 22, which fails `engines.node >= 26`. So: keep `node:26-bookworm` and make the slow parts persistent through runner volumes instead of a custom image. Add to the runner's `config.yml`:

```yaml
container:
  valid_volumes:
    - /srv/forgejo-cache/pnpm-store
    - /srv/forgejo-cache/npm-cache
    - /srv/forgejo-cache/ms-playwright
  options: >-
    -v /srv/forgejo-cache/pnpm-store:/pnpm-store
    -v /srv/forgejo-cache/npm-cache:/npm-cache
    -v /srv/forgejo-cache/ms-playwright:/ms-playwright
```

Workflows then set `npm_config_store_dir=/pnpm-store`, `npm_config_cache=/npm-cache`, `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`. `pnpm install` becomes a link step, `npm i -g pnpm` hits the npm cache, Chromium is downloaded once per Playwright version. The only remaining apt call is `playwright install-deps chromium` on PR runs (Chromium's shared libraries). If that 30 seconds ever matters, the owner can add a six-line Dockerfile later (Appendix C); nothing in this plan depends on it.

`rsync`, `jq` and the IPv4 DNS shim are no longer needed by any workflow in this plan.

---

## 2. Stage 0: Create the repo and the local workspace

Owner does 2.1 and 2.2 (needs Forgejo admin). Executing model does the rest.

2.1 On Forgejo: create `Dark-Avian-Labs/Arsenal`, private, no README, default branch `main`. Do not enable Actions yet.
2.2 Create the secrets from 1.6 (copy values from the old repos' secrets; the owner has them in a password manager per AGENTS.md).
2.3 Locally:

```
cd "D:\Development\Dark Avian Labs"
mkdir Arsenal && cd Arsenal
git init -b main
git remote add forgejo https://git.darkavianlabs.com/Dark-Avian-Labs/Arsenal.git
git commit --allow-empty -m "chore: initial commit"
git push -u forgejo main
git checkout -b migration
```

Gate: `git remote -v` shows only `forgejo`.

---

## 3. Stage 1: Assemble the monorepo with history

Use `git subtree add` so every app keeps its history. Run from `Arsenal/`:

```
git remote add old-appbase   ../AppBase
git remote add old-armory    ../Armory
git remote add old-budget    ../BudgetPlanner
git remote add old-codex     ../Codex
git remote add old-sentinel  ../Sentinel
git remote add old-outfitter ../Outfitter
git fetch --all

git subtree add --prefix=apps/_template      old-appbase/main
git subtree add --prefix=apps/armory         old-armory/main
git subtree add --prefix=apps/budget-planner old-budget/main
git subtree add --prefix=apps/codex          old-codex/main
git subtree add --prefix=apps/sentinel       old-sentinel/main
git subtree add --prefix=apps/outfitter      old-outfitter/main
```

Then remove what does not belong in an app directory any more (per app, with `git rm`):

- `apps/*/.forgejo/` (workflows move to root in Stage 8)
- `apps/*/pnpm-lock.yaml`, `apps/*/pnpm-workspace.yaml` (one lockfile at root)
- `apps/*/run-quality-checks.mjs`, `apps/*/scripts/dependency-update.mjs`, `apps/*/scripts/runtime-preflight.mjs` (root copies in Stage 1.3)
- `apps/*/.releaserc.json`, `apps/*/CHANGELOG.md`, `apps/*/scripts/append-changelog.mjs`, `apps/*/scripts/changelogEntry.mjs`, `apps/*/scripts/changelogEntry.test.ts`, `apps/*/scripts/consolidate-changelog.mjs`, `apps/*/scripts/patchCoverageLayout.mjs`
- `apps/*/.prettierignore`, `apps/*/.prettierrc.json`, `apps/*/.oxfmtrc.json`
- `apps/codex/.github/`, `apps/codex/.vscode/`, `apps/armory/.vscode/`, `apps/*/.cursor/` (move `apps/codex/.cursor/skills/codex-wor-roster` to root `.cursor/skills/` first; delete the rest)
- `apps/*/AUDIT-2026-10-09.html`, `apps/_template/PLAN.md` (keep a copy of this plan at root as `docs/migration/PLAN.md`)
- `apps/_template/docs/org-standards/` (rewritten in Stage 9)
- `apps/sentinel/packages/agent/` is **moved**, not deleted: `git mv apps/sentinel/packages/agent packages/sentinel-agent`
- `apps/sentinel/.forgejo/workflows/release.yml` goes with the rest of `.forgejo`

### 3.1 Root `pnpm-workspace.yaml`

```yaml
packages:
  - apps/*
  - packages/*

allowBuilds:
  '@clerk/shared': true
  better-sqlite3: true
  cuimp: true
  esbuild: true
  unrs-resolver: true

update:
  githubActions: true

catalog:
  '@clerk/express': ^2.1.77
  '@clerk/react': ^6.17.7
  '@clerk/testing': ^2.2.44
  '@dotenvx/dotenvx': ^2.33.0
  '@fontsource-variable/cascadia-mono': ^5.3.0
  '@fontsource-variable/geist': ^5.3.0
  '@fontsource-variable/geist-mono': ^5.3.0
  '@playwright/test': ^1.64.0
  '@tailwindcss/vite': ^4.3.3
  '@types/better-sqlite3': ^9.6.0
  '@types/express': ^5.0.6
  '@types/node': ^26.6.4
  '@types/react': ^19.3.0
  '@types/react-dom': ^19.3.0
  '@vitejs/plugin-react': ^6.1.2
  '@vitest/coverage-v8': ^5.0.3
  better-sqlite3: ^13.0.3
  express: ^5.2.1
  express-rate-limit: ^8.7.1
  helmet: ^8.3.0
  oxfmt: ^0.72.0
  oxlint: ^1.87.0
  react: ^19.3.0
  react-dom: ^19.3.0
  react-router: ^8.4.0
  tailwindcss: ^4.3.3
  typescript: ^7.0.2
  vite: ^8.3.4
  vitest: ^5.0.3
  zod: ^4.6.5
```

No `overrides` (DAL-SRV-06). Take the newest caret range seen in any old `package.json` when they differ.

Rewrite every `apps/*/package.json` and `packages/*/package.json` so each dependency listed above uses `"catalog:"`. App-specific dependencies (`cheerio`, `cuimp`, `tesseract.js`, `i18next`, `html-to-image`, `@napi-rs/lzma`, `undici`, `clsx`, `tailwind-merge`, `happy-dom`, `@testing-library/*`, `domhandler`, `supertest`) stay as plain ranges in the app that uses them.

Remove from every app `package.json` (only things whose code is already gone or that nothing imports; `cookie-parser`, `compression`, `express-session`, `csrf-sync` and `tsx` are removed in the stage that deletes their code, otherwise the Stage 1 typecheck gate fails):
- `semantic-release`, `@semantic-release/*` (DAL-DEP-01)
- `@dark-avian-labs/sentinel-agent` URL dependency; replace with `"@dark-avian-labs/sentinel-agent": "workspace:*"` (DAL-ARCH-02)
- `globals` (Codex)
- `packageManager` and `engines` (root only)

Set every app `"version": "0.0.0-dev"` (DAL-DEP-01: versions live in tags).

### 3.2 Root `package.json`

```json
{
  "name": "dark-avian-labs-apps",
  "private": true,
  "type": "module",
  "scripts": {
    "preflight": "node scripts/runtime-preflight.mjs",
    "validate": "node run-quality-checks.mjs",
    "check-format": "oxfmt --check .",
    "format": "oxfmt --write .",
    "lint": "oxlint .",
    "lint:fix": "oxlint --fix .",
    "typecheck": "pnpm -r --workspace-concurrency=1 run --if-present typecheck",
    "build": "pnpm -r run --if-present build",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "pnpm -r --workspace-concurrency=1 run --if-present test:e2e",
    "icons:sync": "node scripts/icons/sync.mjs",
    "dev": "echo 'use: pnpm --filter <app> dev'"
  },
  "devDependencies": {
    "@material-symbols/svg-400": "^0.48.0",
    "@playwright/test": "catalog:",
    "@vitest/coverage-v8": "catalog:",
    "oxfmt": "catalog:",
    "oxlint": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "engines": { "node": ">=26.0.0", "pnpm": ">=12.0.0" },
  "packageManager": "pnpm@12.9.1"
}
```

### 3.3 Root helper files

- `run-quality-checks.mjs`: copy from `apps/_template` (they were identical). Change the Typecheck step command to `pnpm run typecheck` (already) and leave the rest.
- `scripts/runtime-preflight.mjs`: copy unchanged.
- `scripts/dependency-update.mjs`: copy, then make two changes: every `pnpm(['update', ...])` call gets `'-r'` added as the first argument after `'update'`; replace `const packagePaths = [...]` with a function `packagePaths()` that returns `['pnpm-lock.yaml', 'pnpm-workspace.yaml', ...git(['ls-files', '--', '**/package.json']).split('\n').filter(Boolean)]` and update its two call sites. Add this comment above `updateWithActions`: `// pnpm only knows about .github/workflows. Copy .forgejo/workflows there, let pnpm bump the action SHAs, copy back.`
- `.oxfmtrc.json`: copy from `apps/_template`; add `"ignorePatterns": ["**/dist/**", "**/coverage/**", "**/*.generated.ts", "**/scripts/data/**", "pnpm-lock.yaml"]` (check the key name against `oxfmt --help`; if the key differs, use the one oxfmt documents).
- `.oxlintrc.json` (DAL-CLI-04):

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "import", "jsx-a11y", "promise", "vitest"],
  "categories": {
    "correctness": "error",
    "suspicious": "warn",
    "perf": "warn"
  },
  "ignorePatterns": ["**/dist/**", "**/coverage/**", "**/*.generated.ts", "**/scripts/data/**"]
}
```

If `oxlint` rejects a plugin name, remove that name and continue; do not disable categories.

- `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*'],
    passWithNoTests: true,
    coverage: { provider: 'v8', reporter: ['text-summary'], reportsDirectory: 'coverage' },
  },
});
```

Each app keeps its own `vitest.config.ts` (project-level settings such as `env` and `include` stay there). Remove `coverage` blocks from the app configs.

- `.gitignore` at root: union of the six old ones, with `apps/*/data/`, `apps/*/.env.keys`, `apps/*/dist/`, `packages/*/dist/`, `**/node_modules/`, `**/coverage/`, `**/test-results/`, `**/e2e/.clerk/`, `*.log`, `_resources/`.

### 3.4 Gate

```
pnpm install
pnpm run preflight
pnpm --filter @dark-avian-labs/sentinel-agent run build   # apps import its dist
pnpm run typecheck     # every app still typechecks on its own code
pnpm run test
```

All green. Commit: `chore: assemble monorepo from six repositories`.

---

## 4. Stage 2: Extract the shared packages

This is the heart of DAL-ARCH-01. The rule for every file: **compare the copies, take the newest shell behaviour, parameterise what is genuinely app-specific.** Use `git diff --no-index apps/_template/<path> apps/<app>/<path>` for each app. The audit measured which files are identical (safe to move as-is) and which drifted; the drifted list is in Section 4.4.

### 4.1 `packages/config`

Files:
- `tsconfig.base.json`: from `apps/_template/tsconfig.base.json`, plus `"verbatimModuleSyntax": true`, `"erasableSyntaxOnly": true`, `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`.
- `tsconfig.server.json`: extends base; `"noEmit": true`, `"allowImportingTsExtensions": true`, `"rewriteRelativeImportExtensions": true`, `"types": ["node"]`, `"lib": ["ES2022"]`.
- `tsconfig.client.json`: extends base; `"jsx": "react-jsx"`, `"lib": ["ES2022", "DOM", "DOM.Iterable"]`, `"noEmit": true`, `"moduleResolution": "Bundler"`, `"module": "ESNext"`, `"allowImportingTsExtensions": true`.
- `package.json`: `{ "name": "@dark-avian-labs/config", "private": true, "version": "0.0.0", "files": ["*.json", "*.ts"] }`.

Each app's `tsconfig.json` becomes `{ "extends": "@dark-avian-labs/config/tsconfig.client.json", "include": ["client", "shared", "vite-env.d.ts"], "compilerOptions": { "paths": { "@/*": ["./client/*"] }, "baseUrl": "." } }` and `tsconfig.server.json` becomes `{ "extends": "@dark-avian-labs/config/tsconfig.server.json", "include": ["server", "shared", "scripts"] }`. Add `"@dark-avian-labs/config": "workspace:*"` to each app's devDependencies.

### 4.2 `packages/server-kit`

`package.json`:

```json
{
  "name": "@dark-avian-labs/server-kit",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./testing": { "types": "./dist/testing/index.d.ts", "import": "./dist/testing/index.js" }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.build.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@clerk/express": "catalog:",
    "@dark-avian-labs/sentinel-agent": "workspace:*",
    "@dotenvx/dotenvx": "catalog:",
    "better-sqlite3": "catalog:",
    "express": "catalog:",
    "express-rate-limit": "catalog:",
    "helmet": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@dark-avian-labs/config": "workspace:*",
    "@types/better-sqlite3": "catalog:",
    "@types/express": "catalog:",
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`tsconfig.build.json`: extends `@dark-avian-labs/config/tsconfig.base.json`, `"outDir": "dist"`, `"rootDir": "src"`, `"declaration": true`, `"include": ["src"]`, `"exclude": ["src/**/*.test.ts"]`. This package **is compiled** because `pnpm deploy` copies it into `node_modules`, where Node refuses to strip types.

Move these from `apps/_template/server/` into `packages/server-kit/src/` with `git mv`, keeping their tests:

| From (`apps/_template/server/`) | To (`packages/server-kit/src/`) |
| --- | --- |
| `logger.ts` | `logger.ts` |
| `clerkEnv.ts` | `env/clerkEnv.ts` |
| `config.ts` | `env/loadEnv.ts` (split, see below) |
| `auth/clerk.ts`, `auth/clerkAuthorizedParties.ts` (+tests), `auth/middleware.ts` (+test) | `auth/` |
| `http/requestId.ts`, `http/helmetCsp.ts` (+test), `http/dalAppNavProxy.ts` (+test) | `http/` |
| `db/connection.ts` | `db/sqlite.ts` (generic `openSqlite(path, pragmas)`) |
| `sentinelAgent.ts` | `sentinelAgent.ts` |
| `app.ts` | `createApp.ts` (parameterised, see below) |
| `index.ts` | `startServer.ts` (the listen + graceful shutdown part) |
| `signedInClerk.ts` (+test) | `testing/signedInClerk.ts` |

Also fold in from `apps/codex/packages/core/src/`: `db/sqlitePath.ts` (+test), `db/sqlitePragmas.ts`, `db/singleton.ts`, `validation.ts` (+test), `middleware/appPublicBaseUrl.ts`, `testing/mockResponse.ts`. Where Codex core and AppBase have the same module (auth, helmet, clerkEnv, logger), diff them and keep the union of behaviour; Codex-only functions like `requireCodexAdmin` and `getCodexAppId` go to `apps/codex/server/core.ts`, not into the kit.

Do **not** move: `db/sessionSchema.ts`, `db/sqliteSessionStore.ts`, `session/bindClerkUserSession.ts`, `routes/auth.ts`'s CSRF route, `types/express-session.d.ts`. Stage 3 deletes them.

**`env/loadEnv.ts`**: export `loadAppEnv(projectRoot)` containing the `.env.keys` then `.env.<NODE_ENV>` loading and `normalizeClerkEnv()` from the old `config.ts`, plus the helpers `parseBooleanEnv`, `parseIntEnv`, `readPackageVersion`. Export `resolveProjectRoot(importMetaUrl)` with the existing `dist`-aware logic. Export `readReleaseVersion(projectRoot)`:

```ts
export function readReleaseVersion(projectRoot: string, fallback = '0.0.0-dev'): string {
  const fromEnv = process.env.APP_VERSION?.trim();
  if (fromEnv) return fromEnv;
  try {
    const raw = fs.readFileSync(path.join(projectRoot, 'release.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === 'string' && parsed.version.trim()) return parsed.version.trim();
  } catch {
    // no release.json in dev or PR builds
  }
  return fallback;
}
```

Each app's `server/config.ts` then becomes short: call `loadAppEnv`, compute its own constants (`PORT` default, `APP_NAME`, `APP_ID`, DB paths), and `export const APP_VERSION = readReleaseVersion(PROJECT_ROOT)`.

**`createApp.ts`**: lift `apps/_template/server/app.ts`. Signature:

```ts
export interface CreateAppOptions {
  appName: string;
  appId: string;
  appVersion: string;
  projectRoot: string;
  nodeEnv: string;
  trustProxy: boolean;
  secureCookies: boolean;
  legalPageUrl: string;
  jsonLimit?: string;                 // default '100kb'; Armory and Codex pass '1mb'
  metricsMiddleware?: RequestHandler;
  readiness?: () => boolean;          // default () => true; apps pass a DB ping
  rateLimits?: { api?: number; write?: number; page?: number; asset?: number };
  mountBeforeApi?: (app: express.Express) => void;   // Armory uses this for the raw-body Clerk webhook route
}
export interface AppBundle { app: express.Express; apiRouter: express.Router; }
export function createApp(options: CreateAppOptions): AppBundle;
```

Inside: helmet, requestId, metrics, json/urlencoded, baseline limiter, `/healthz`, `/readyz` (calls `readiness()`), Clerk middleware, the `/api` 4xx/5xx logger, `/api/version` (returns `appVersion`), `/api/dal-app-nav`, `apiRouter` mounted at `/api` behind the API limiter, favicon routes, `/api` 404, `/legal` redirect, static SPA serving, error handler. Everything that referenced sessions or CSRF is left out (Stage 3). Apps add routes with `bundle.apiRouter.use(...)` before calling `startServer`.

**`startServer.ts`**: `startServer({ app, host, port, shutdownTimeoutMs, onClose, sentinelAgent })` with the listen, SIGINT/SIGTERM, unhandledRejection, uncaughtException and timeout logic from the old `index.ts`.

**`auth/middleware.ts`** keeps `isClerkConfigured`, `clerkMiddleware`, `getClerkAuthState`, `requireAuthApi`, `requireAdmin`. Stage 3 adds the write guard here.

**`testing/index.ts`** exports `signedInClerk`, `mockResponse`, and a new `withServer`:

```ts
import type { Express } from 'express';
import http from 'node:http';

export async function withServer<T>(app: Express, fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
```

Replace `supertest` usage in app tests with `withServer` + `fetch` (DAL-DEP-04) when you touch those tests in Stage 3; do not do a separate pass for it.

### 4.3 `packages/ui`

Not compiled; Vite consumes the TypeScript source. `package.json`:

```json
{
  "name": "@dark-avian-labs/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./styles.css": "./src/styles/input.css",
    "./clerk-auth.css": "./src/styles/clerk-auth.css",
    "./icons": "./src/icons/index.tsx"
  },
  "scripts": { "typecheck": "tsc -p tsconfig.json --noEmit", "test": "vitest run" },
  "peerDependencies": { "react": "catalog:", "react-dom": "catalog:", "react-router": "catalog:", "@clerk/react": "catalog:" },
  "dependencies": {
    "@fontsource-variable/cascadia-mono": "catalog:",
    "@fontsource-variable/geist": "catalog:",
    "@fontsource-variable/geist-mono": "catalog:"
  },
  "devDependencies": {
    "@dark-avian-labs/config": "workspace:*",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

Note: no `@fontsource-variable/material-symbols-rounded` (Stage 4 replaces it).

Move from `apps/_template/client/` into `packages/ui/src/` (keep tests next to the files):

| From | To |
| --- | --- |
| `components/Layout/*` (AsciiWaveBackground, DalAppNav, DalAppNavRail, dalAppNavRailGeometry, HexSideBackground, Layout, SearchBar, StaleClientUpdateBanner) | `layout/` |
| `components/ui/*` | `components/` |
| `context/ThemeContext.tsx` | `theme/ThemeContext.tsx` |
| `clerk/*` (ClerkAuthShell, clerkAppearance, clerk-auth.css, index.ts) | `clerk/` and `styles/clerk-auth.css` |
| `features/auth/{AuthContext,authRedirect,ProtectedRoute,AccountRequired,SignInPage,SignUpPage}.tsx` | `auth/` |
| `features/not-found/NotFoundPage.tsx` | `pages/NotFoundPage.tsx` |
| `hooks/useStaleBundlePrompt.ts` | `hooks/` |
| `lib/dalAppNav.ts` (+test), `lib/asciiBackground/*`, `lib/scaffoldSearch.ts` (+test) | `lib/` |
| `utils/api.ts` (+test) | `api/apiFetch.ts` |
| `styles/input.css`, `styles/acrylic-noise.svg` | `styles/` |
| `public/theme-init.js` | `public/theme-init.js` (canonical copy). Each app keeps its own `public/theme-init.js`; add a first-line comment `// Copy of packages/ui/public/theme-init.js. Edit there, then copy.` It is 65 lines and must stay a plain static file because it runs before React. |

`src/index.ts` re-exports everything public.

**Tailwind scanning.** Each app's `client/styles/app.css` becomes:

```css
@import '@dark-avian-labs/ui/styles.css';
@source '../../../../packages/ui/src';
/* app-specific tokens and classes below this line */
```

Without the `@source` line Tailwind will not see the classes used inside `packages/ui` and the shell renders unstyled. Verify by building one app and checking that `.glass-card` (or whatever class `GlassCard` uses) exists in `dist/client/assets/*.css`.

**Drifted shell files.** These are the files that differ between apps (from the audit's hash comparison): `Layout.tsx`, `SearchBar.tsx`, `ThemeContext.tsx`, `AuthContext.tsx`, `SignInPage.tsx`, `SignUpPage.tsx`, `ErrorBoundary.tsx`, `Menu.tsx`, `Modal.tsx`, `MaterialSymbol.tsx`, `UiStyleSelector.tsx`, `AsciiWaveBackground.tsx`, `useAsciiBackgroundCanvas.ts`, `cascadiaCanvasTypography.ts`, `ChunkErrorBoundary.tsx`, `authRedirect.ts`, `useStaleBundlePrompt.ts`, `api.ts`, `input.css`, `main.tsx`, `App.tsx`. For each:

1. `git diff --no-index apps/_template/client/<path> apps/<app>/client/<path>` for every app that has it.
2. If the difference is a bug fix or improvement that AppBase lacks, apply it to the `packages/ui` copy.
3. If the difference is app identity (app name, nav items, header slot content, max width `max-w-[2000px]` vs `max-w-3xl`, `h-14` header, extra context providers, game-domain colours), expose it as a prop of `Layout` / `ThemeContext` or keep it in the app's own file.
4. If you cannot tell, stop and ask with the diff.

`Layout` props to expect: `appName`, `navItems`, `headerSlot?`, `subheaderSlot?`, `width?: 'wide' | 'narrow'`, `showSearch?`, `footerLinks?`. Armory's `EquipmentGridModal`, Codex's `CollectionSubheader`/`HeaderSearch`/`useLayoutSlots`, BudgetPlanner's `PlanSwitcher`/`LanguageSelector` stay in their apps and are passed through slots.

**Game-domain CSS** (`--color-dmg-*`, `--color-riven*`) stays in `apps/armory/client/styles/app.css`.

### 4.4 Wire the apps to the packages

Per app:
- `package.json`: add `"@dark-avian-labs/server-kit": "workspace:*"`, `"@dark-avian-labs/ui": "workspace:*"`, `"@dark-avian-labs/config": "workspace:*"` (dev).
- Delete the moved files from `apps/<app>/server/` and `apps/<app>/client/` (they are now imports). Use `git rm`.
- Rewrite imports: `'../components/ui/Modal.js'` → `'@dark-avian-labs/ui'`; `'./auth/middleware.js'` → `'@dark-avian-labs/server-kit'`. Do this with the editor's search and replace per app; verify with `pnpm --filter <app> typecheck`.
- `server/index.ts` per app shrinks to: load config, create DB(s), `createApp({...})`, mount routes on `apiRouter`, `startServer(...)`.
- `apps/codex`: fold `packages/games/{warframe,epic7,wor}/src` into `apps/codex/server/games/<game>/` and their assets into `apps/codex/client/assets/games/<game>/`. Delete `apps/codex/packages/` entirely (core is now server-kit; game packages are plain directories). Update the imports. The favicons become the owner-provided `favicon.svg` files (DAL-CLI-02).
- `apps/sentinel`: `server/sentinelAgent.ts` and the agent import come from server-kit; `scripts/sync-ingest-token-to-siblings.mjs` and `scripts/bootstrap-env-from-armory.mjs` change their relative paths from `../<App>/` to `../<app-dir>/` (lowercase, under `apps/`).
- `apps/_template`: same treatment; it is the reference consumer with no features.

### 4.5 Gate

```
pnpm install
pnpm run validate
pnpm run build
pnpm run test:e2e        # builds are required first; each app's playwright.config starts its own server
```

Open each app with `pnpm --filter <app> dev` once and click through sign-in, theme switcher, UI style switcher, nav rail. Commit: `refactor: extract server-kit, ui and config packages`.

---

## 5. Stage 3: Delete the session stack (DAL-SRV-01)

### 5.1 server-kit

Remove `express-session`, `csrf-sync` from every `package.json` (they should already be gone from server-kit; check apps). Delete from every app: `server/db/sessionSchema.ts`, `server/db/sqliteSessionStore.ts` (+tests), `server/session/bindClerkUserSession.ts` (+test), `server/types/express-session.d.ts`, `apps/codex/src/types/csrf-sync.d.ts`, the `/api/csrf` route and `issueCsrfToken` in `server/routes/auth.ts` or `api.ts`, and the `SESSION_*` constants in `server/config.ts` (`SESSION_SECRET`, `SESSION_COOKIE_NAME`, `SESSION_DB_PATH`, `COOKIE_DOMAIN`). Delete `.env.example`/`.env.development`/`.env.production` keys `SESSION_SECRET`, `SESSION_COOKIE_NAME`, `SESSION_DB_PATH`, `COOKIE_DOMAIN` (the encrypted files can be edited with `pnpm dotenvx set`/`unset` per app; if `dotenvx unset` is unavailable, leave the encrypted values in place and only remove them from `.env.example`; the server ignores unknown keys).

Add the write guard to `packages/server-kit/src/auth/middleware.ts`:

```ts
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF replacement. A cross-site form or fetch can carry cookies but cannot set
 * an Authorization header or make Sec-Fetch-Site read same-origin. Writes that
 * arrive with cookie-only Clerk auth are rejected.
 */
export function rejectCrossSiteWrites(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();
  const site = req.headers['sec-fetch-site'];
  if (site === 'cross-site') {
    res.status(403).json({ error: 'Cross-site request rejected' });
    return;
  }
  next();
}

export function requireAuthApi(req: Request, res: Response, next: NextFunction): void {
  const state = getClerkAuthState(req);
  if (!state.authenticated || !state.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!SAFE_METHODS.has(req.method)) {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Bearer token required for write requests' });
      return;
    }
  }
  next();
}
```

`requireAdmin` gets the same Bearer check. In `createApp`, mount `rejectCrossSiteWrites` on `/api` before `apiRouter`. The `readiness` option replaces the session-DB `SELECT 1`; each app passes `() => { db.prepare('SELECT 1').get(); return true; }` on its main database, or omits it.

Add tests in `middleware.test.ts`: POST with cookie-only auth is 401; POST with Bearer is allowed; POST with `Sec-Fetch-Site: cross-site` is 403; GET is unaffected.

### 5.2 ui

In `packages/ui/src/api/apiFetch.ts` remove `getCsrfToken`, `clearCsrfToken`, `isCsrfFailureResponse`, the CSRF retry block and the `X-CSRF-Token` header. Keep `ApiError`, `setClerkTokenGetter`, the Bearer header and the 401 refresh-and-retry. Update `apiFetch.test.ts` accordingly. Check `grep -r "csrf" packages apps --include=*.ts --include=*.tsx` returns nothing afterwards.

### 5.3 App-specific state that lived in the session

- **Outfitter**: `server/session/account.ts` and `server/routes/accounts.ts` read `req.session.account_id`. Replace with a query `SELECT id FROM accounts WHERE clerk_user_id = ? AND is_active = 1` (the column exists). The "set active" route already updates `is_active`; make it the only source of truth. Delete `server/session/`.
- **Codex**: `server/session/worSessionBinding.ts` and `epic7SessionBinding.ts` store the selected game account. Add `active_wor_account_id INTEGER` and `active_epic7_account_id INTEGER` columns to the user table (migration in the schema file, `ALTER TABLE ... ADD COLUMN` guarded by a `PRAGMA table_info` check), read and write them in the routes that used the session, delete both files and `tests/auth-session.test.ts` / `tests/epic7SessionBinding.test.ts`; rewrite `tests/epic7-session-api.test.ts` against the column.
- **Armory, BudgetPlanner, Sentinel, _template**: nothing beyond the CSRF token. Verify with `grep -rn "req.session" apps/<app>/server`.

### 5.4 Gate

`pnpm run validate && pnpm run build && pnpm run test:e2e`. Sign in to one app via `pnpm --filter armory dev`, save a build, confirm the request carries `Authorization: Bearer` and no `X-CSRF-Token` (browser devtools). Commit: `refactor!: replace session+CSRF stack with bearer-only writes`.

---

## 6. Stage 4: Client changes

### 6.1 Icons (DAL-CLI-01)

`scripts/icons/sync.mjs`:

```js
// Reads every icon name used in apps/ and packages/ui, extracts the SVG path data from
// @material-symbols/svg-400/rounded, and writes packages/ui/src/icons/icons.generated.ts.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve('@material-symbols/svg-400/package.json'));
const roots = ['apps', 'packages/ui/src'];
const names = new Set();

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', 'dist', 'coverage', 'data', 'scripts'].includes(entry)) continue;
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|mjs)$/.test(entry) && !p.endsWith('icons.generated.ts')) {
      const text = readFileSync(p, 'utf8');
      for (const m of text.matchAll(/\bname=["']([a-z0-9_]+)["']/g)) names.add(m[1]);
      for (const m of text.matchAll(/\bicon(?:Name)?:\s*["']([a-z0-9_]+)["']/g)) names.add(m[1]);
    }
  }
}
for (const r of roots) walk(r);

const extra = JSON.parse(readFileSync('scripts/icons/extra-icons.json', 'utf8')); // dynamic names
for (const n of extra) names.add(n);

function pathData(file) {
  const svg = readFileSync(file, 'utf8');
  const m = /<path d="([^"]+)"/.exec(svg);
  if (!m) throw new Error(`no path in ${file}`);
  return m[1];
}

const sorted = [...names].sort();
const missing = [];
const lines = [];
for (const name of sorted) {
  const base = path.join(pkgDir, 'rounded', `${name}.svg`);
  const fill = path.join(pkgDir, 'rounded', `${name}-fill.svg`);
  try {
    lines.push(`  ${JSON.stringify(name)}: { d: ${JSON.stringify(pathData(base))}, fill: ${JSON.stringify(pathData(fill))} },`);
  } catch {
    missing.push(name);
  }
}
if (missing.length) {
  console.error(`Unknown Material Symbols names: ${missing.join(', ')}`);
  process.exit(1);
}
writeFileSync(
  'packages/ui/src/icons/icons.generated.ts',
  `// Generated by scripts/icons/sync.mjs. Do not edit.\nexport const ICONS = {\n${lines.join('\n')}\n} as const;\nexport type IconName = keyof typeof ICONS;\n`,
);
console.log(`${sorted.length} icons written`);
```

`scripts/icons/extra-icons.json` starts as `[]`. If an icon is referenced through a variable (the audit found 6 to 24 distinct names per app, some may be dynamic), add the name here.

`packages/ui/src/icons/index.tsx`:

```tsx
import type { SVGAttributes } from 'react';
import { ICONS, type IconName } from './icons.generated.ts';

export type { IconName };

export function MaterialSymbol({
  name,
  filled = false,
  className,
  ...rest
}: { name: IconName; filled?: boolean } & Omit<SVGAttributes<SVGSVGElement>, 'children' | 'name'>) {
  const icon = ICONS[name];
  if (!icon) {
    if (import.meta.env.DEV) throw new Error(`Unknown icon "${name}". Run pnpm icons:sync.`);
    return null;
  }
  return (
    <svg
      viewBox="0 -960 960 960"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden
      className={['material-symbol', className].filter(Boolean).join(' ')}
      {...rest}
    >
      <path d={filled ? icon.fill : icon.d} />
    </svg>
  );
}
```

Material Symbols SVGs use `viewBox="0 -960 960 960"`; check one file in `node_modules/@material-symbols/svg-400/rounded/` and adjust if different. In `input.css` replace the `.material-symbol-rounded` font rules with `.material-symbol { display: inline-block; vertical-align: -0.125em; flex-shrink: 0; }` and move any size variants (`text-xl` style sizing still works because width/height are `1em`).

Run `pnpm icons:sync`; fix unknown names; delete `@fontsource-variable/material-symbols-rounded` everywhere; delete the old `MaterialSymbol.tsx` files; make every call site type-check (`name` is now a union type, which catches typos).

**CSP.** Keep `'unsafe-inline'` in `style-src`. Do not try removing it: Clerk's prebuilt components inject `<style>` elements and the sign-in page breaks without it (the owner has verified this). After the icon font is gone, Clerk is the only consumer, so add this comment next to the directive in `packages/server-kit/src/http/helmetCsp.ts`: `// Only Clerk's injected <style> tags still need this. Drop it if Clerk is ever replaced by a custom integration (DAL-CLI-01).`

### 6.2 Codex favicons (DAL-CLI-02)

Replace the three `.ico` imports with the owner's `favicon.svg` per game. Confirm `dist/client/assets` no longer contains `favicon-*.ico` after `pnpm --filter codex build`.

### 6.3 BudgetPlanner drag and drop (DAL-DEP-05)

Replace `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` with `@dnd-kit/react` and `@dnd-kit/helpers`. Mapping, from the official migration guide:

| Old | New |
| --- | --- |
| `DndContext` + `SortableContext` | `DragDropProvider` from `@dnd-kit/react` (no `SortableContext`) |
| `useSortable({ id })` from `@dnd-kit/sortable` | `useSortable({ id, index })` from `@dnd-kit/react/sortable`; returns `{ ref, isDragging, handleRef }` |
| `setNodeRef`, `attributes`, `listeners`, `transform`, `transition`, `CSS.Transform.toString` | gone; pass `ref={sortable.ref}`; transforms are automatic |
| `arrayMove(items, from, to)` in `onDragEnd` | `setItems((items) => move(items, event))` with `move` from `@dnd-kit/helpers` |
| sorting strategies | removed |

`grep -rn "@dnd-kit" apps/budget-planner/client` lists the files. Keep the keyboard accessibility that existed (the new package handles keyboard sorting by default). Verify by dragging an entry in `pnpm --filter budget-planner dev`.

### 6.4 Bundle check (DAL-CLI-03)

`pnpm --filter budget-planner build` and read the chunk sizes Vite prints. If a chunk named `paths-*.js` is still over 300 KB, find the eager imports in `client/app/routes.tsx` / `paths.ts` and wrap `PlanPage`, `PrintView`, `InvitePage` in `React.lazy`. Stop if that does not change the picture; report the sizes.

### 6.5 Gate

`pnpm run validate && pnpm run build`. Check `dist/client/assets` of each app has no `.woff2` over 100 KB (Geist and Cascadia are ~30 to 60 KB each). Commit: `feat(ui): svg icons, dnd-kit/react, favicons`.

---

## 7. Stage 5: Server cleanups

- **DAL-SRV-02** `cookie-parser`: delete the `app.use(cookieParser())` lines and imports (Armory, BudgetPlanner, Codex, Outfitter), then remove `cookie-parser` and `@types/cookie-parser` from those `package.json` files.
- **DAL-SRV-03** `compression`: delete the middleware and the SSE filter in Armory and Codex, then remove `compression` and `@types/compression` from both `package.json` files. Compression moves to the reverse proxy (Section 12.3).
- **DAL-SRV-06** overrides: none in the new `pnpm-workspace.yaml`; confirm `pnpm why undici` resolves to the direct `^8` dependency in Armory and Codex.
- **DAL-SRV-05** zod: BudgetPlanner `server/lib/planValidation.ts` becomes `shared/schemas.ts` with zod schemas (`entrySchema`, `planSchema`), `z.infer` types replace `client/lib/types.ts` duplicates, routes call `schema.safeParse(req.body)` and return `{ error, fields }` built from `issues[].path[0]` to keep the existing client error format. Same for Outfitter route bodies (`gear`, `artifacts`, `accounts`, `outfit`) and Sentinel `server/metrics/ingestSchema.ts`. Keep the existing tests as the spec; they must pass unchanged except for import paths.
- **DAL-SRV-07** Outfitter OCR client-side: move `server/ocr/recognizeGear.ts` logic to `client/features/outfitter/ocr/recognize.ts` using `tesseract.js`'s browser build (`createWorker`), with `langPath: '/tessdata'` and `eng.traineddata` moved to `apps/outfitter/public/tessdata/eng.traineddata` (gzip it: `eng.traineddata.gz`, tesseract accepts the `.gz` name). The parsing in `shared/gearOcr.ts` and `shared/artifactOcr.ts` is already server-agnostic; call it in the browser. Delete the upload route, `server/ocr/`, and `tesseract.js` from server-side imports (the dependency stays, now used by the client). Add `'wasm-unsafe-eval'` to `script-src` in `helmetCsp.ts` **only for Outfitter**: give `createAppHelmet` an `extraScriptSrc?: string[]` option and pass it from `apps/outfitter/server/index.ts`. `worker-src 'self' blob:` is already present.
- **DAL-HYG-01** Codex: move `tests/*.test.ts` next to the code they cover, `tests/helpers/*` to `server/testing/`, delete `tests/` and `src/`.
- **DAL-HYG-02 / 03**: fix the port list in `apps/_template/.env.example` to match 1.4; `engines` is root-only now.
- **DAL-DEP-03**: confirm the leftovers from Stage 1 are gone: `git ls-files | grep -E "prettier|codeql|tailwind-v4"` prints nothing.

Gate: `pnpm run validate && pnpm run build && pnpm run test:e2e`. Commit per bullet or as `refactor(server): zod schemas, client-side OCR, cleanups`.

---

## 8. Stage 6: Run TypeScript directly (DAL-SRV-04)

Applies to `apps/*/server/**` and `apps/*/shared/**` and `apps/*/scripts/*.ts`. Packages stay compiled.

1. Rewrite relative import specifiers from `.js` to `.ts`. In each app directory run a search and replace limited to `server/`, `shared/`, `scripts/`: pattern `(from\s+['"]\.{1,2}/[^'"]+)\.js(['"])` → `$1.ts$2`, and the same for `import(` dynamic imports. The audit counted 33 to 400 per app; verify none remain with `grep -rn "from '\./.*\.js'" apps/*/server apps/*/shared`.
2. `tsconfig.server.json` already has `allowImportingTsExtensions`, `rewriteRelativeImportExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax` from Stage 2. Run `pnpm run typecheck`. Fix every `erasableSyntaxOnly` error (there should be none; the audit grepped for enums, namespaces and parameter properties) and every `verbatimModuleSyntax` error (change `import { X }` to `import type { X }` where X is a type).
3. App `package.json` scripts:

```json
"scripts": {
  "typecheck": "tsc -p tsconfig.server.json --noEmit && tsc -p tsconfig.json --noEmit",
  "dev": "node --watch server/index.ts",
  "dev:client": "vite",
  "build": "pnpm run typecheck && vite build",
  "start": "node server/index.ts",
  "test": "vitest run",
  "test:e2e": "playwright test",
  "test:e2e:install": "playwright install chromium"
}
```

`dev` no longer wraps Vite; run `pnpm --filter <app> dev` and `pnpm --filter <app> dev:client` in two terminals, or keep `scripts/dev.mjs` and change its server command to `['--watch', 'server/index.ts']` (drop the tsx path). Remove `tsx` from every `package.json` (Outfitter's `catalog:import` script becomes `node scripts/import-catalog.ts`). Delete `tsconfig.server.json`'s `outDir` if present. Delete `dist/server` from `.gitignore` comments and from any deploy file list.

4. `playwright.config.ts` per app: `command: 'node server/index.ts'` instead of `node dist/server/index.js`. `scripts/e2e-signed-in.mjs` likewise.
5. `ecosystem.config.cjs` per app (new file, committed):

```js
const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'Armory',                       // PM2 name from table 1.4
      script: 'server/index.ts',
      interpreter: 'node',                  // explicit; PM2 would otherwise look for ts-node on a .ts script
      cwd: path.join(__dirname, '..', '..', 'current'),  // <SERVER_PATH>/current, survives release switches
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: 12000,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
```

`cwd` points at the `current` symlink on purpose: `pm2 restart` reuses the stored cwd, and the symlink is what changes between deploys. `.env.keys` and `release.json` are resolved from `process.cwd()`, which is `current/`, so the deploy script's symlinks (1.5) make them visible. Confirm `server/config.ts` reads env files relative to `process.cwd()` (it does in AppBase) and `release.json` relative to `PROJECT_ROOT`.

6. Add `"files"` to each app `package.json` so `pnpm deploy` copies exactly what production needs:

```json
"files": ["server", "shared", "dist/client", "public", "assets", "icons", "ecosystem.config.cjs", ".env.production", "scripts/data"]
```

Drop entries the app does not have (`icons` is Armory only, `scripts/data` is Codex and Armory). Do not list `data`, `e2e`, `client`, tests. Verify in Stage 8.

Gate: `pnpm run validate && pnpm run build && pnpm run test:e2e` and `pnpm --filter armory start` boots with `NODE_ENV=production` set and a decrypted `.env.keys` present (prints "Server running"). Commit: `refactor!: run server TypeScript directly on Node 26`.

---

## 9. Stage 7: Versioning without semantic-release (DAL-DEP-01, DAL-SEC-01)

`scripts/ci/release.mjs`:

```js
// Usage: node scripts/ci/release.mjs <app-dir-name>
// Writes GITHUB_OUTPUT: version, previous, release (true|false), tag. Writes notes to $RUNNER_TEMP/notes-<app>.md.
import { appendFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const app = process.argv[2];
if (!app) throw new Error('app required');
const prefix = `${app}-v`;

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let previous = null;
try {
  previous = git(['describe', '--tags', '--abbrev=0', '--match', `${prefix}*`]).slice(prefix.length);
} catch {
  // first release of this app in this repo
}

const range = previous ? `${prefix}${previous}..HEAD` : 'HEAD';
const paths = ['--', `apps/${app}`, 'packages', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'];
const raw = git(['log', '--first-parent', '--format=%H%x1f%s%x1f%b%x1e', range, ...paths]);
const commits = raw
  .split('\x1e')
  .map((c) => c.trim())
  .filter(Boolean)
  .map((c) => {
    const [sha, subject, body] = c.split('\x1f');
    const pr = /^Merge pull request '(.+)' \(#(\d+)\)/.exec(subject);
    return { sha: sha.slice(0, 7), subject: pr ? pr[1] : subject, pr: pr ? pr[2] : null, body: body ?? '' };
  });

function bumpOf({ subject, body }) {
  const m = /^(\w+)(\([^)]*\))?(!)?:/.exec(subject);
  if ((m && m[3]) || /BREAKING CHANGE/.test(body)) return 'major';
  if (m && m[1] === 'feat') return 'minor';
  return 'patch';
}

let version = previous ?? '0.0.0';
let release = commits.length > 0;
if (release) {
  const level = commits.map(bumpOf).includes('major') ? 'major' : commits.map(bumpOf).includes('minor') ? 'minor' : 'patch';
  const [ma, mi, pa] = version.split('.').map(Number);
  version = level === 'major' ? `${ma + 1}.0.0` : level === 'minor' ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`;
}

const notes = commits.map((c) => `- ${c.subject}${c.pr ? ` (#${c.pr})` : ''} ${c.sha}`).join('\n') || '- Redeploy, no new commits for this app.';
const notesPath = path.join(process.env.RUNNER_TEMP ?? '.', `notes-${app}.md`);
writeFileSync(notesPath, notes + '\n');

const out = [`version=${version}`, `previous=${previous ?? ''}`, `release=${release}`, `tag=${prefix}${version}`, `notes_path=${notesPath}`];
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, out.join('\n') + '\n');
console.log(out.join('\n'));
console.log(notes);
```

Seed tags at cutover (Section 12) so numbering continues: `armory-v1.74.5`, `budget-planner-v1.9.4`, `codex-v1.81.5`, `sentinel-v1.5.5`, `outfitter-v1.28.4`, each pointing at the Stage 1 assembly commit.

Vite `define` in each app: `'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.APP_VERSION ?? '0.0.0-dev')`. Remove `readPackageVersion` from `vite.config.ts`. The server reads `APP_VERSION` or `release.json` (Stage 2). PR builds show `v0.0.0-dev`; check `e2e/smoke.spec.ts` still matches (`/v\d+\.\d+\.\d+/` matches the prefix; if the test is anchored, relax it).

Gate: `node scripts/ci/release.mjs armory` prints a version and notes locally (no tags yet, so `0.0.1` and `release=true`). Commit: `ci: tag-based versioning`.

---

## 10. Stage 8: Workflows (DAL-CI-01 through DAL-CI-10)

Delete nothing from the old repos yet. Create these five files at `Arsenal/.forgejo/workflows/`. Keep the action SHAs exactly as written; Sayori will bump them.

### 10.1 `pr.yml`

```yaml
name: PR checks

on:
  pull_request:

concurrency:
  group: pr-${{ github.head_ref || github.ref }}
  cancel-in-progress: true

env:
  CI: true
  npm_config_store_dir: /pnpm-store
  npm_config_cache: /npm-cache
  PLAYWRIGHT_BROWSERS_PATH: /ms-playwright

jobs:
  validate:
    runs-on: build-node26
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - name: Enable pnpm
        run: npm install -g pnpm@$(node -p 'require("./package.json").packageManager.replace(/^pnpm@/, "")')

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Validate
        run: pnpm run validate

      - name: Build
        run: pnpm run build

      - name: Playwright browser and OS deps
        run: |
          pnpm exec playwright install chromium
          pnpm exec playwright install-deps chromium

      - name: E2E armory
        run: pnpm --filter armory run test:e2e
        env:
          DOTENV_PRIVATE_KEY_DEVELOPMENT: ${{ secrets.DOTENV_PRIVATE_KEY_DEVELOPMENT_ARMORY }}
          E2E_CLERK_USER_EMAIL: ${{ secrets.E2E_CLERK_USER_EMAIL }}
          E2E_CLERK_USER_PASSWORD: ${{ secrets.E2E_CLERK_USER_PASSWORD }}

      - name: E2E budget-planner
        run: pnpm --filter budget-planner run test:e2e
        env:
          DOTENV_PRIVATE_KEY_DEVELOPMENT: ${{ secrets.DOTENV_PRIVATE_KEY_DEVELOPMENT_BUDGET_PLANNER }}
          E2E_CLERK_USER_EMAIL: ${{ secrets.E2E_CLERK_USER_EMAIL }}
          E2E_CLERK_USER_PASSWORD: ${{ secrets.E2E_CLERK_USER_PASSWORD }}

      - name: E2E codex
        run: pnpm --filter codex run test:e2e
        env:
          DOTENV_PRIVATE_KEY_DEVELOPMENT: ${{ secrets.DOTENV_PRIVATE_KEY_DEVELOPMENT_CODEX }}
          E2E_CLERK_USER_EMAIL: ${{ secrets.E2E_CLERK_USER_EMAIL }}
          E2E_CLERK_USER_PASSWORD: ${{ secrets.E2E_CLERK_USER_PASSWORD }}

      - name: E2E outfitter
        run: pnpm --filter outfitter run test:e2e
        env:
          DOTENV_PRIVATE_KEY_DEVELOPMENT: ${{ secrets.DOTENV_PRIVATE_KEY_DEVELOPMENT_OUTFITTER }}
          E2E_CLERK_USER_EMAIL: ${{ secrets.E2E_CLERK_USER_EMAIL }}
          E2E_CLERK_USER_PASSWORD: ${{ secrets.E2E_CLERK_USER_PASSWORD }}

      - name: E2E sentinel
        run: pnpm --filter sentinel run test:e2e

      - name: E2E template
        run: pnpm --filter dal-template run test:e2e
        env:
          DOTENV_PRIVATE_KEY_DEVELOPMENT: ${{ secrets.DOTENV_PRIVATE_KEY_DEVELOPMENT_TEMPLATE }}
          E2E_CLERK_USER_EMAIL: ${{ secrets.E2E_CLERK_USER_EMAIL }}
          E2E_CLERK_USER_PASSWORD: ${{ secrets.E2E_CLERK_USER_PASSWORD }}
```

If `DOTENV_PRIVATE_KEY_DEVELOPMENT_TEMPLATE` is not created, the template's signed-in project stays unregistered and prints a warning; that is the documented behaviour and acceptable.

### 10.2 `deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]
    paths:
      - 'apps/**'
      - 'packages/**'
      - 'pnpm-lock.yaml'
      - 'pnpm-workspace.yaml'
      - 'scripts/ci/**'
      - '.forgejo/workflows/deploy.yml'
      - '.forgejo/workflows/_deploy-app.yml'
  workflow_dispatch:
    inputs:
      apps:
        description: Comma-separated app directories to deploy, or "all"
        required: true
        default: all
        type: string

concurrency:
  group: deploy-main
  cancel-in-progress: false

jobs:
  changes:
    runs-on: light-node26
    timeout-minutes: 5
    outputs:
      armory: ${{ steps.detect.outputs.armory }}
      budget-planner: ${{ steps.detect.outputs.budget-planner }}
      codex: ${{ steps.detect.outputs.codex }}
      sentinel: ${{ steps.detect.outputs.sentinel }}
      outfitter: ${{ steps.detect.outputs.outfitter }}
    steps:
      - run: apk add --no-cache git
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
      - id: detect
        env:
          BEFORE: ${{ github.event.before }}
          AFTER: ${{ github.sha }}
          FORCE: ${{ github.event_name == 'workflow_dispatch' && inputs.apps || '' }}
        run: node scripts/ci/changes.mjs

  armory:
    needs: changes
    if: needs.changes.outputs.armory == 'true'
    uses: ./.forgejo/workflows/_deploy-app.yml
    with:
      app: armory
      pm2_name: Armory
      port: 3002
    secrets:
      DOTENV_PRIVATE_KEY_PRODUCTION: ${{ secrets.DOTENV_PRIVATE_KEY_PRODUCTION_ARMORY }}
      SERVER_PATH: ${{ secrets.SERVER_PATH_ARMORY }}
      SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
      SERVER_KNOWN_HOST: ${{ secrets.SERVER_KNOWN_HOST }}
      SERVER_HOST: ${{ secrets.SERVER_HOST }}
      SERVER_USER: ${{ secrets.SERVER_USER }}
      SERVER_SSH_PORT: ${{ secrets.SERVER_SSH_PORT }}

  budget-planner:
    needs: changes
    if: needs.changes.outputs.budget-planner == 'true'
    uses: ./.forgejo/workflows/_deploy-app.yml
    with:
      app: budget-planner
      pm2_name: BudgetPlanner
      port: 3003
    secrets:
      DOTENV_PRIVATE_KEY_PRODUCTION: ${{ secrets.DOTENV_PRIVATE_KEY_PRODUCTION_BUDGET_PLANNER }}
      SERVER_PATH: ${{ secrets.SERVER_PATH_BUDGET_PLANNER }}
      SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
      SERVER_KNOWN_HOST: ${{ secrets.SERVER_KNOWN_HOST }}
      SERVER_HOST: ${{ secrets.SERVER_HOST }}
      SERVER_USER: ${{ secrets.SERVER_USER }}
      SERVER_SSH_PORT: ${{ secrets.SERVER_SSH_PORT }}

  codex:
    needs: changes
    if: needs.changes.outputs.codex == 'true'
    uses: ./.forgejo/workflows/_deploy-app.yml
    with:
      app: codex
      pm2_name: Codex
      port: 3001
    secrets:
      DOTENV_PRIVATE_KEY_PRODUCTION: ${{ secrets.DOTENV_PRIVATE_KEY_PRODUCTION_CODEX }}
      SERVER_PATH: ${{ secrets.SERVER_PATH_CODEX }}
      SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
      SERVER_KNOWN_HOST: ${{ secrets.SERVER_KNOWN_HOST }}
      SERVER_HOST: ${{ secrets.SERVER_HOST }}
      SERVER_USER: ${{ secrets.SERVER_USER }}
      SERVER_SSH_PORT: ${{ secrets.SERVER_SSH_PORT }}

  sentinel:
    needs: changes
    if: needs.changes.outputs.sentinel == 'true'
    uses: ./.forgejo/workflows/_deploy-app.yml
    with:
      app: sentinel
      pm2_name: Sentinel
      port: 3005
    secrets:
      DOTENV_PRIVATE_KEY_PRODUCTION: ${{ secrets.DOTENV_PRIVATE_KEY_PRODUCTION_SENTINEL }}
      SERVER_PATH: ${{ secrets.SERVER_PATH_SENTINEL }}
      SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
      SERVER_KNOWN_HOST: ${{ secrets.SERVER_KNOWN_HOST }}
      SERVER_HOST: ${{ secrets.SERVER_HOST }}
      SERVER_USER: ${{ secrets.SERVER_USER }}
      SERVER_SSH_PORT: ${{ secrets.SERVER_SSH_PORT }}

  outfitter:
    needs: changes
    if: needs.changes.outputs.outfitter == 'true'
    uses: ./.forgejo/workflows/_deploy-app.yml
    with:
      app: outfitter
      pm2_name: Outfitter
      port: 3004
    secrets:
      DOTENV_PRIVATE_KEY_PRODUCTION: ${{ secrets.DOTENV_PRIVATE_KEY_PRODUCTION_OUTFITTER }}
      SERVER_PATH: ${{ secrets.SERVER_PATH_OUTFITTER }}
      SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
      SERVER_KNOWN_HOST: ${{ secrets.SERVER_KNOWN_HOST }}
      SERVER_HOST: ${{ secrets.SERVER_HOST }}
      SERVER_USER: ${{ secrets.SERVER_USER }}
      SERVER_SSH_PORT: ${{ secrets.SERVER_SSH_PORT }}

  discord-status:
    runs-on: light-node26
    timeout-minutes: 5
    needs: [changes, armory, budget-planner, codex, sentinel, outfitter]
    if: always()
    steps:
      - uses: iShark5060/actions-discord-status@66f6681ff19536b7787feecc4fdc20c506de365b # v1.2.1
        with:
          webhook: ${{ secrets.DISCORD_WEBHOOK }}
          job_results: ${{ join(needs.*.result, ',') }}
          mention_on: failure
          content: '<@${{ secrets.DISCORD_USERID }}>'
          title: ${{ github.workflow }}
          description: ${{ contains(needs.*.result, 'failure') && 'Deploy failed. Check the logs before redeploying.' || contains(needs.*.result, 'cancelled') && 'Deploy was cancelled.' || 'Deploy finished. Skipped apps had no deployable changes.' }}
```

The caller jobs omit `runs-on` on purpose: Forgejo expands the reusable workflow's jobs and each uses its own label.

### 10.3 `_deploy-app.yml`

```yaml
name: Deploy one app

on:
  workflow_call:
    inputs:
      app:
        required: true
        type: string
      pm2_name:
        required: true
        type: string
      port:
        required: true
        type: number
    secrets:
      DOTENV_PRIVATE_KEY_PRODUCTION:
        required: true
      SERVER_PATH:
        required: true
      SSH_PRIVATE_KEY:
        required: true
      SERVER_KNOWN_HOST:
        required: true
      SERVER_HOST:
        required: true
      SERVER_USER:
        required: true
      SERVER_SSH_PORT:
        required: true

env:
  CI: true
  npm_config_store_dir: /pnpm-store
  npm_config_cache: /npm-cache

jobs:
  deploy:
    runs-on: build-node26
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0

      - name: Enable pnpm
        run: npm install -g pnpm@$(node -p 'require("./package.json").packageManager.replace(/^pnpm@/, "")')

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Resolve version
        id: release
        run: node scripts/ci/release.mjs "${{ inputs.app }}"

      - name: Build
        env:
          APP_VERSION: ${{ steps.release.outputs.version }}
        run: pnpm --filter "${{ inputs.app }}..." run --if-present build

      - name: Assemble release directory
        env:
          APP: ${{ inputs.app }}
          VERSION: ${{ steps.release.outputs.version }}
          SHA: ${{ github.sha }}
        run: |
          set -euo pipefail
          rm -rf /tmp/deploy
          pnpm --filter "$APP" deploy --prod /tmp/deploy
          printf '{"version":"%s","sha":"%s","builtAt":"%s"}\n' "$VERSION" "$SHA" "$(date -u +%FT%TZ)" > /tmp/deploy/release.json
          test -f /tmp/deploy/.env.production || cp "apps/$APP/.env.production" /tmp/deploy/.env.production
          test -f /tmp/deploy/ecosystem.config.cjs
          test -d /tmp/deploy/dist/client
          test -d /tmp/deploy/server
          test -d /tmp/deploy/node_modules/@dark-avian-labs/server-kit/dist
          ls -la /tmp/deploy
          tar -C /tmp/deploy -czf "/tmp/${APP}-${VERSION}.tgz" .

      - name: Deploy
        env:
          APP: ${{ inputs.app }}
          VERSION: ${{ steps.release.outputs.version }}
          PM2_NAME: ${{ inputs.pm2_name }}
          PORT: ${{ inputs.port }}
          DOTENV_PRIVATE_KEY_PRODUCTION: ${{ secrets.DOTENV_PRIVATE_KEY_PRODUCTION }}
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
          SERVER_KNOWN_HOST: ${{ secrets.SERVER_KNOWN_HOST }}
          SERVER_HOST: ${{ secrets.SERVER_HOST }}
          SERVER_USER: ${{ secrets.SERVER_USER }}
          SERVER_PATH: ${{ secrets.SERVER_PATH }}
          SERVER_SSH_PORT: ${{ secrets.SERVER_SSH_PORT }}
        run: bash scripts/ci/deploy.sh

      - name: Create Forgejo release
        if: steps.release.outputs.release == 'true'
        env:
          TOKEN: ${{ github.token }}
          TAG: ${{ steps.release.outputs.tag }}
          NAME: ${{ inputs.app }} ${{ steps.release.outputs.version }}
          NOTES_PATH: ${{ steps.release.outputs.notes_path }}
          SHA: ${{ github.sha }}
        run: |
          node --input-type=module -e '
            import { readFileSync } from "node:fs";
            const body = readFileSync(process.env.NOTES_PATH, "utf8");
            const res = await fetch(`${process.env.GITHUB_API_URL}/repos/${process.env.GITHUB_REPOSITORY}/releases`, {
              method: "POST",
              headers: { Authorization: `token ${process.env.TOKEN}`, "Content-Type": "application/json" },
              body: JSON.stringify({ tag_name: process.env.TAG, target_commitish: process.env.SHA, name: process.env.NAME, body }),
            });
            if (!res.ok) { console.error(await res.text()); process.exit(1); }
            console.log(`release ${process.env.TAG} created`);
          '

      - name: Cleanup SSH key
        if: always()
        run: rm -f ~/.ssh/deploy_key
```

If the release step fails with 403, the Forgejo action token lacks release permission on this instance. Then create a token named `RELEASE_TOKEN` scoped to `write:repository` only, add it as a secret, pass it through `_deploy-app.yml` secrets, and use it instead of `github.token`. That is still narrower than the old `CI_PAT`, which needed push to `main`.

### 10.4 `scripts/ci/deploy.sh`

```bash
#!/usr/bin/env bash
# Uploads /tmp/<APP>-<VERSION>.tgz, installs it as a new release directory, switches the
# `current` symlink, restarts PM2 and verifies /api/version. Rolls the symlink back on failure.
set -euo pipefail

for v in APP VERSION PM2_NAME PORT DOTENV_PRIVATE_KEY_PRODUCTION SSH_PRIVATE_KEY SERVER_KNOWN_HOST SERVER_HOST SERVER_USER SERVER_PATH SERVER_SSH_PORT; do
  [ -n "${!v:-}" ] || { echo "ERROR: $v is empty"; exit 1; }
done
case "$SERVER_PATH" in
  ""|"/"|"."|".."|"~"|"/home"|"/root"|*".."*|*"//"*) echo "ERROR: unsafe SERVER_PATH '$SERVER_PATH'"; exit 1 ;;
esac

mkdir -p ~/.ssh
printf '%s\n' "$SSH_PRIVATE_KEY" > ~/.ssh/deploy_key
chmod 600 ~/.ssh/deploy_key
printf '%s\n' "$SERVER_KNOWN_HOST" >> ~/.ssh/known_hosts
SSH="ssh -p $SERVER_SSH_PORT -i $HOME/.ssh/deploy_key -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$HOME/.ssh/known_hosts $SERVER_USER@$SERVER_HOST"

TGZ="/tmp/${APP}-${VERSION}.tgz"
REL="$SERVER_PATH/releases/$VERSION"

echo "==> upload $TGZ to $REL"
$SSH "set -e; mkdir -p '$REL' '$SERVER_PATH/data'; tar -xzf - -C '$REL'" < "$TGZ"

echo "==> link data and .env.keys into the release"
printf 'DOTENV_PRIVATE_KEY_PRODUCTION=%s\n' "$DOTENV_PRIVATE_KEY_PRODUCTION" | $SSH "umask 077; cat > '$SERVER_PATH/.env.keys'"
$SSH "set -e; ln -sfn ../../data '$REL/data'; ln -sfn ../../.env.keys '$REL/.env.keys'; /usr/local/bin/pm2-chown-tree '$SERVER_PATH'"

PREVIOUS=$($SSH "readlink '$SERVER_PATH/current' 2>/dev/null || true")
echo "==> previous release: ${PREVIOUS:-none}"

echo "==> switch current -> releases/$VERSION"
$SSH "set -e; ln -sfn 'releases/$VERSION' '$SERVER_PATH/current.tmp'; mv -Tf '$SERVER_PATH/current.tmp' '$SERVER_PATH/current'"

echo "==> restart $PM2_NAME"
$SSH "/usr/local/bin/pm2-restart-safe '$PM2_NAME'"

echo "==> verify"
ok=false
for i in $(seq 1 30); do
  got=$($SSH "curl -fsS --max-time 3 http://127.0.0.1:$PORT/api/version" 2>/dev/null || true)
  if [ "$got" = "{\"version\":\"$VERSION\"}" ]; then ok=true; break; fi
  sleep 2
done
if [ "$ok" != true ]; then
  echo "ERROR: $PM2_NAME did not report version $VERSION (last response: ${got:-none})"
  if [ -n "$PREVIOUS" ]; then
    echo "==> rolling back to $PREVIOUS"
    $SSH "set -e; ln -sfn '$PREVIOUS' '$SERVER_PATH/current.tmp'; mv -Tf '$SERVER_PATH/current.tmp' '$SERVER_PATH/current'; /usr/local/bin/pm2-restart-safe '$PM2_NAME'"
  fi
  exit 1
fi
echo "==> $PM2_NAME is serving $VERSION"

echo "==> prune old releases (keep 3)"
$SSH "cd '$SERVER_PATH/releases' && ls -1t | tail -n +4 | xargs -r rm -rf"
```

Notes for the executing model: `/api/version` returns exactly `{"version":"x.y.z"}` from `createApp`; keep that shape. `pm2-chown-tree` and `pm2-restart-safe` are existing host scripts; do not replace them. `mv -Tf` makes the symlink switch atomic.

### 10.5 `scripts/ci/changes.mjs`

```js
// Decides which apps to deploy. Outputs <app>=true|false for each app to GITHUB_OUTPUT.
// Rules: FORCE lists apps or "all"; otherwise diff BEFORE..AFTER. packages/, lockfile, workspace
// file, scripts/ci and the deploy workflows affect every app; apps/<x>/ affects x. A change that
// only touches dependency files and does not change any production dependency deploys nothing.
import { appendFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const APPS = ['armory', 'budget-planner', 'codex', 'sentinel', 'outfitter'];
const { BEFORE = '', AFTER = 'HEAD', FORCE = '' } = process.env;

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return r.status === 0 ? r.stdout : null;
}
function emit(result) {
  const lines = APPS.map((a) => `${a}=${result[a] ? 'true' : 'false'}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}

if (FORCE) {
  const wanted = FORCE === 'all' ? APPS : FORCE.split(',').map((s) => s.trim());
  emit(Object.fromEntries(APPS.map((a) => [a, wanted.includes(a)])));
  process.exit(0);
}

if (!BEFORE || /^0+$/.test(BEFORE) || git(['cat-file', '-e', `${BEFORE}^{commit}`]) === null) {
  console.log('No valid BEFORE commit; deploying everything');
  emit(Object.fromEntries(APPS.map((a) => [a, true])));
  process.exit(0);
}

const files = (git(['diff', '--name-only', BEFORE, AFTER]) ?? '').split('\n').filter(Boolean);
console.log('Changed files:\n' + files.join('\n'));

const isDepFile = (f) => /(^|\/)package\.json$/.test(f) || f === 'pnpm-lock.yaml' || f === 'pnpm-workspace.yaml';
if (files.length > 0 && files.every(isDepFile)) {
  const prodSubset = (json) => {
    const p = JSON.parse(json || '{}');
    return JSON.stringify({ d: p.dependencies ?? {}, o: p.optionalDependencies ?? {}, p: p.peerDependencies ?? {} });
  };
  let prodChanged = false;
  for (const f of files.filter((f) => /(^|\/)package\.json$/.test(f))) {
    if (prodSubset(git(['show', `${BEFORE}:${f}`])) !== prodSubset(git(['show', `${AFTER}:${f}`]))) prodChanged = true;
  }
  if (files.includes('pnpm-workspace.yaml')) {
    // A catalog entry changed. It is a production change if any package.json lists that name in a prod section.
    const before = git(['show', `${BEFORE}:pnpm-workspace.yaml`]) ?? '';
    const after = git(['show', `${AFTER}:pnpm-workspace.yaml`]) ?? '';
    const catalogLines = (t) => new Set(t.split('\n').filter((l) => /^\s{2}['"]?[@a-z]/.test(l)));
    const changedNames = [...catalogLines(after)].filter((l) => !catalogLines(before).has(l)).map((l) => l.trim().split(':')[0].replace(/['"]/g, ''));
    const manifests = (git(['ls-files', '--', '**/package.json', 'package.json']) ?? '').split('\n').filter(Boolean);
    for (const m of manifests) {
      const p = JSON.parse(readFileSync(m, 'utf8'));
      const prodNames = Object.keys({ ...p.dependencies, ...p.optionalDependencies, ...p.peerDependencies });
      if (changedNames.some((n) => prodNames.includes(n))) prodChanged = true;
    }
  }
  if (!prodChanged) {
    console.log('Only development dependencies changed; nothing to deploy');
    emit(Object.fromEntries(APPS.map((a) => [a, false])));
    process.exit(0);
  }
}

const global = files.some(
  (f) => f.startsWith('packages/') || f === 'pnpm-lock.yaml' || f === 'pnpm-workspace.yaml' || f.startsWith('scripts/ci/') || f.startsWith('.forgejo/workflows/'),
);
emit(Object.fromEntries(APPS.map((a) => [a, global || files.some((f) => f.startsWith(`apps/${a}/`))])));
```

### 10.6 `dependencies.yml`

Copy from `apps/_template/.forgejo/workflows/dependencies.yml` as it was in the old repo; it needs no change beyond the script edits from Stage 1.3. Runner `light-node26`.

### 10.7 `security.yml`

Copy from the old file with three changes: the `relevant` regex becomes `/(^|\/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$|^\.forgejo\/workflows\/security\.yml$/` (already matches nested package.json), the `filter` step gets `GITHUB_TOKEN: ${{ github.token }}` in its `env`, and the `push.paths` list adds `'**/package.json'`. The `security` gate job stays on `runs-on: light`.

### 10.8 Gate

Workflows cannot run until Actions is enabled on the new repo (Section 12). Validate syntax now: `node -e "require('yaml')"` is not available, so install nothing; instead open each file and check indentation by eye, and run `pnpm exec oxfmt --check .forgejo` if oxfmt formats YAML (if it refuses, skip). Run `node scripts/ci/changes.mjs` locally with `BEFORE=HEAD~1 AFTER=HEAD` and confirm it prints five lines. Commit: `ci: monorepo workflows with per-app release directories`.

---

## 11. Stage 9: Documentation

- Root `AGENTS.md`: rewrite from `apps/_template/AGENTS.md`. Keep the ports table, the Clerk notes, the dotenvx notes, the theme/acrylic notes. Replace "There is no shared UI package. Copy the shell by hand." with "The shell is `@dark-avian-labs/ui`; the HTTP stack is `@dark-avian-labs/server-kit`. Change them once." Replace the session/CSRF paragraph with the bearer-only rule from Stage 3. Document `pnpm --filter <app> dev`, `pnpm run validate`, tags as versions, `release.json`, and the deploy layout from 1.5.
- `docs/org-standards/ci-pr-release.md`: rewrite to describe `pr.yml`, `deploy.yml`, `_deploy-app.yml`, `dependencies.yml`, `security.yml`, the three runner labels, the secrets table from 1.6, and "no `permissions:` in Forgejo workflows". Delete every mention of Blacksmith, `pnpm/setup`, Dependabot, semantic-release.
- `docs/migration/PLAN.md`: this file, for the record. Delete `apps/*/AUDIT-*.html`.
- Each app's `README.md`: fix paths and the `pnpm --filter <app>` commands.

Commit: `docs: monorepo conventions`.

Open the pull request `migration` → `main` on Forgejo. It cannot be merged yet because the checks have not run; Section 12 enables them.

---

## 12. Cutover checklist (owner)

Work top to bottom. Items marked **[runner]** and **[server]** need SSH; **[forgejo]** is the web UI or `fj`.

### 12.1 Before the first deploy

- [ ] **[runner]** Reboot the runner host so the IPv6 disable takes effect. Create `/srv/forgejo-cache/{pnpm-store,npm-cache,ms-playwright}` owned by the runner user. Add the `container.valid_volumes` and `container.options` block from 1.7 to the runner `config.yml`. Restart the runner.
- [ ] **[forgejo]** On `Dark-Avian-Labs/Arsenal`: Settings → Actions → enable. Confirm the secrets from 1.6 exist. Settings → Branches → protect `main`: require PR, require status checks `validate` and `security`, no direct-push exceptions for anyone (CI no longer pushes to main).
- [ ] **[forgejo]** Push mirror: Settings → Repository → Mirror → add push mirror to `https://github.com/Dark-Avian-Labs/Arsenal.git` (create the empty GitHub repo first).
- [ ] **[forgejo]** Re-run the checks on the `migration` PR (close/reopen or push an empty commit). `validate` and `security` must be green. Merge the PR. Do not squash; the subtree history is the point.
- [ ] **[local]** Seed the version tags on the merge commit's ancestor (the Stage 1 assembly commit works too, any commit on main before the first deploy):

  ```
  git fetch forgejo && git checkout main && git pull
  git tag armory-v1.74.5 && git tag budget-planner-v1.9.4 && git tag codex-v1.81.5 && git tag sentinel-v1.5.5 && git tag outfitter-v1.28.4
  git push forgejo --tags
  ```

  Tag pushes are allowed by branch protection (it protects branches, not tags). If the push is rejected, check Settings → Tags for a protection rule.

### 12.2 First deploy

- [ ] **[forgejo]** Actions → Deploy → Run workflow → `apps: all`. Expect: five `deploy` jobs upload a release directory, switch `current`, restart PM2, and then **fail at "verify"** with "did not report version", because PM2 is still running the old process definition pointing at `dist/server/index.js`. The rollback step finds no previous release and exits. This is expected on the very first run only.
- [ ] **[server]** For each app, as the PM2 user, re-point the process at the new layout (replace the path and name per app, from tables 1.4 and 1.5):

  ```
  cd <SERVER_PATH>/current
  pm2 delete Armory
  pm2 start ecosystem.config.cjs
  pm2 save
  pm2 logs Armory --lines 30 --nostream
  curl -s http://127.0.0.1:3002/api/version      # {"version":"1.74.6"} or similar
  curl -s http://127.0.0.1:3002/readyz
  ```

  If `pm2 logs` shows `Cannot find module 'ts-node'`, PM2 ignored `interpreter: node` on this version; edit `ecosystem.config.cjs` on the host to `script: 'node', args: 'server/index.ts', interpreter: 'none'`, re-run the three pm2 commands, and tell the executing model to make the same change in the repo.
- [ ] **[forgejo]** Run the Deploy workflow again with `apps: all`. All five must be green, including verify. Each creates a Forgejo release `<app>-v<version>`.
- [ ] **[browser]** Open every app, sign in, perform one write (save a build, add an entry, etc.). Check Sentinel shows all five processes with the new versions.

### 12.3 Reverse proxy

- [ ] **[server]** Caddy already has `encode` configured for the upstreams (Armory and Codex no longer compress in-process). Verify once after the first green deploy: `curl -sI -H 'Accept-Encoding: gzip' https://<armory-host>/api/version | grep -i content-encoding` should print `gzip` or `zstd`.

### 12.4 Clean up the server

- [ ] **[server]** In each `<SERVER_PATH>`, delete the old top-level files: `dist/`, `node_modules/`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `public/`, `icons/`, `assets/`, `background.txt`, `packages/`, `scripts/`, `.env.production`. Keep `data/`, `.env.keys`, `releases/`, `current`. Delete `data/sessions.db` (no longer used).

### 12.5 Retire the old repositories

- [ ] **[forgejo]** For each of AppBase, Armory, BudgetPlanner, Codex, Sentinel, Outfitter: Settings → disable Actions (so Sayori and the weekly audit stop), then Settings → Archive. Leave Sentinel's old `agent-v0.1.0` release in place; nothing references it after the migration, and archiving keeps it readable.
- [ ] **[github]** Archive the six GitHub mirrors.
- [ ] **[forgejo]** User settings → Applications: revoke the `CI_PAT` token. Confirm `SAYORI_TOKEN` is scoped to repository and PR write only.
- [ ] **[forgejo]** Delete repo-level secrets on the archived repos (optional; archiving disables Actions, but fewer copies of the SSH key is better).
- [ ] **[local]** Move the six old checkouts out of `D:\Development\Dark Avian Labs` (or delete them) so agents do not open the wrong tree. Update any Cursor skills that reference the old paths (`codex-wor-roster`, `dev-server`, `forgejo-first` remotes list).

### 12.6 Watch for a week

- [ ] Sayori's first run opens three PRs (`deps/production`, `deps/development`, `deps/actions`) on `Arsenal`. Merging `deps/development` must produce a Deploy run where `changes` reports all five apps `false`.
- [ ] Monday's `security.yml` run is green.
- [ ] A normal feature PR to one app deploys only that app and creates one release.

---

## 13. Rollback

- **One app, bad release:** on the server, `ln -sfn releases/<previous> <SERVER_PATH>/current.tmp && mv -Tf <SERVER_PATH>/current.tmp <SERVER_PATH>/current && /usr/local/bin/pm2-restart-safe <Name>`. The deploy script does this automatically when verify fails.
- **Whole migration, before 12.5:** the old repos are untouched. Re-enable Actions on them, re-point PM2 at `<SERVER_PATH>/dist/server/index.js` with the old cwd, run the old `ci.yml` via `workflow_dispatch`. Nothing in 12.1 to 12.4 deletes old data; `data/` and `.env.keys` are shared between old and new layouts.
- **After 12.5:** unarchive on Forgejo and proceed as above.

---

## Appendix A: audit ID to stage

| ID | Stage |
| --- | --- |
| DAL-ARCH-01 | 1, 2 |
| DAL-ARCH-02 | 1 (`workspace:*`), 12.5 |
| DAL-ARCH-03 | 9 |
| DAL-SRV-01 | 3 |
| DAL-SRV-02 | 1, 5 |
| DAL-SRV-03 | 1, 5, 12.3 |
| DAL-SRV-04 | 6 |
| DAL-SRV-05 | 5 |
| DAL-SRV-06 | 1 |
| DAL-SRV-07 | 5 |
| DAL-CLI-01 | 4 |
| DAL-CLI-02 | 4 |
| DAL-CLI-03 | 4 |
| DAL-CLI-04 | 1 |
| DAL-DEP-01 | 1, 7 |
| DAL-DEP-02 | 1 |
| DAL-DEP-03 | 1, 5 |
| DAL-DEP-04 | 2, 3 |
| DAL-DEP-05 | 4 |
| DAL-CI-01 | 8 |
| DAL-CI-02 | 8 (`cancel-in-progress: false` on deploy) |
| DAL-CI-03 | 8 (`pnpm deploy`, release dirs, verify, rollback) |
| DAL-CI-04 | 1.7, 12.1 |
| DAL-CI-05 | 8 (shim deleted), 12.1 (reboot) |
| DAL-CI-06 | 8 (main: build + deploy + verify only; e2e on PR) |
| DAL-CI-07 | 8 (`light` kept; explicit `GITHUB_TOKEN`) |
| DAL-CI-08 | 8 (production key only in the Deploy step) |
| DAL-CI-09 | 8 |
| DAL-CI-10 | 1 (release.yml removed) |
| DAL-SEC-01 | 7, 12.1, 12.5 |
| DAL-OPS-01 | rejected by owner; PM2 stays |
| DAL-HYG-01 | 5 |
| DAL-HYG-02 | 5 |
| DAL-HYG-03 | 1 |

## Appendix B: things that look wrong but are not

- `apps/*/package.json` has `"version": "0.0.0-dev"` forever. Versions are tags.
- `packages/ui` has no build step. Vite compiles it as part of each app.
- `packages/server-kit` and `packages/sentinel-agent` do have a build step. `pnpm deploy` copies them into `node_modules`, where Node will not strip types.
- The first Deploy run after cutover fails at verify. See 12.2.
- Caller jobs in `deploy.yml` have no `runs-on`. Forgejo requires that for job expansion.
- `ecosystem.config.cjs` has `cwd` pointing at a symlink. That is how `pm2 restart` picks up the new release.

## Appendix C: optional runner image (only if PR time matters later)

```dockerfile
FROM docker.io/library/node:26-bookworm
RUN npm install -g pnpm@12.9.1 \
 && npx --yes playwright@1.64.0 install-deps chromium \
 && rm -rf /root/.npm
```

Build it in a small Forgejo workflow on a schedule, push to `git.darkavianlabs.com/dark-avian-labs/build-node26-playwright:latest`, and point the `build-node26` label at it. It removes the `install-deps` apt call from PR runs. Nothing else in this plan changes.
