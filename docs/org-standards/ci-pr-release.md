# CI, PR, and release

Workflows live in `.forgejo/workflows/`. Forgejo is the source of truth. Do not put a `permissions` block in those files. Forgejo ignores it and warns on every run.

## Runner labels

| Label          | Use                                                                          |
| -------------- | ---------------------------------------------------------------------------- |
| `build-node26` | Node builds, validate, Playwright, deploy                                    |
| `light-node26` | Light Node jobs, including dependency updates and the deploy change detector |
| `light`        | The `security` gate job, which does not need Node                            |

A Windows job uses `windows-2025:host`. The `:host` suffix is required. Do not invent a new label.

## Actions

Pin third-party actions to a commit SHA and put the release tag in a trailing comment. Sayori bumps those SHAs from `dependencies.yml`. Install pnpm in the job with `npm install -g pnpm@$(node -p 'require("./package.json").packageManager.replace(/^pnpm@/, "")')`, then `pnpm install --frozen-lockfile`.

`pr.yml` does not run `pnpm audit`. A registry incident would stall every pull request. Audit lives in `security.yml`.

## Workflows

| File               | Trigger                                                                   | Role                                                                                            |
| ------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pr.yml`           | `pull_request`                                                            | Install, `pnpm run validate`, `pnpm run build`, then Playwright per app                         |
| `deploy.yml`       | `push` to `main` on app, package, lockfile, and CI paths, or a manual run | Decide which apps changed, then deploy each one                                                 |
| `_deploy-app.yml`  | called by `deploy.yml`                                                    | Build one app, upload a release directory, switch `current`, restart PM2, verify `/api/version` |
| `dependencies.yml` | daily, manual, or `@sayori rebase`                                        | Open or rebase dependency pull requests                                                         |
| `security.yml`     | every `pull_request`, dependency pushes, Monday cron, manual              | `pnpm audit` plus the required `security` gate                                                  |

`pr.yml` uses `cancel-in-progress: true`. `deploy.yml` uses `cancel-in-progress: false`. Do not add path filters to `pr.yml`. A skipped required check stays pending and blocks the merge. Path filters belong on the `push` trigger of `deploy.yml` and `security.yml`.

The caller jobs in `deploy.yml` have no `runs-on`. Forgejo expands the reusable workflow, and the job inside `_deploy-app.yml` sets `build-node26`. Forgejo rejects a `secrets` key under `workflow_call`. The caller jobs pass secrets with `jobs.<job_id>.secrets`.

The required check is the `security` job. It stays green when the audit is skipped and fails when the audit fails. A high advisory published between dependency pull requests is caught by the Monday run.

## Versions

There is one tag per app release, named `<app>-vX.Y.Z`, for example `armory-v1.74.5`. `scripts/ci/release.mjs` reads commits since that tag and prints the next version. The deploy writes that version into `release.json`. When the range contains commits, the workflow creates the next Forgejo release and tag. An app deploy leaves the monorepo tag `v1.0.0` where it is.

`scripts/ci/changes.mjs` decides which apps ship. A change under `apps/<app>/` deploys that app. A change under `packages/`, the lockfile, the workspace file, `scripts/ci/`, or the two deploy workflows deploys every app. Dependency updates always deploy: devDependencies include Vite and Tailwind, which change the client bundle, and a lockfile-only diff can be a transitive production bump.

## Secrets

Shared, one each: `SSH_PRIVATE_KEY`, `SERVER_KNOWN_HOST`, `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_PORT`, `DISCORD_WEBHOOK`, `DISCORD_USERID`, `SAYORI_TOKEN`, `E2E_CLERK_USER_EMAIL`, `E2E_CLERK_USER_PASSWORD`.

Per app, with the suffix `ARMORY`, `BUDGET_PLANNER`, `CODEX`, `SENTINEL`, or `OUTFITTER`: `DOTENV_PRIVATE_KEY_PRODUCTION_<APP>`, `DOTENV_PRIVATE_KEY_DEVELOPMENT_<APP>`, `SERVER_PATH_<APP>`.

The template pull-request job also reads `DOTENV_PRIVATE_KEY_DEVELOPMENT_TEMPLATE`. If that secret is missing, the template's signed-in Playwright project stays unregistered and prints a warning.

Every deployed app build decrypts `.env.production` with that app's `DOTENV_PRIVATE_KEY_PRODUCTION`, then runs the same `vite build`. The client base path is `/`. CI does not push commits to `main`.
