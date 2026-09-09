# CI, PR, and release

Policy for new and updated workflows. The living PR workflow is AppBase [`.github/workflows/pr.yml`](../../.github/workflows/pr.yml). Track A `ci.yml` lives in Armory/Codex.

## Runner tiers

| Workload                                                                                           | Runner                          |
| -------------------------------------------------------------------------------------------------- | ------------------------------- |
| Node PR/CI (validate, version, build, deploy) and utility jobs (`deployment-check`, Discord, etc.) | `blacksmith-2vcpu-ubuntu-2404`  |
| Rust compile, test, and release EXE builds (Poltergeist)                                           | `blacksmith-8vcpu-windows-2025` |

Do not use `ubuntu-latest` or `blacksmith-4vcpu-*` for new/updated DAL jobs.

## Required actions

Third-party actions are **pinned to commit SHAs** with the release tag in a trailing comment. Dependabot (`package-ecosystem: github-actions`) rewrites the SHA and the tag comment; do not ignore minor/patch updates for pinned actions.

| Concern                       | Action (pin the current release SHA)                                                |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| Checkout (Blacksmith jobs)    | `useblacksmith/checkout` (v1 line)                                                  |
| Node + pnpm                   | `pnpm/setup` (v2 line, `runtime: node@26`, `cache: true`, `require-lockfile: true`) |
| Playwright browsers           | `actions/cache` keyed by `${{ runner.os }}-playwright-<playwright version>`         |
| Rust cache (Poltergeist)      | `Swatinem/rust-cache` (`save-if: true`, `cache-on-failure: true`)                   |
| Discord status                | `iShark5060/actions-discord-status` (`job_results` + `mention_on: failure`)         |
| GitHub Release (manual track) | `iShark5060/actions-gh-release` (`upload_checksums: true` when uploading files)     |

`pnpm/setup` with `require-lockfile: true` installs from the lockfile (`pnpm install --frozen-lockfile`). If the lockfile drifted, fix that. Do not delete `pnpm-lock.yaml` on each CI run. Codex's Dependabot catalog-repair job is the exception: it sets `install: false` and runs `pnpm install --lockfile-only --no-frozen-lockfile`.

Do **not** run `pnpm audit` inside `pr.yml` / `ci.yml`. Registry incidents stall validate and deploy for minutes. Audit lives in `security.yml`: every `pull_request` (so a required check never goes pending), lockfile/`package.json` pushes, weekly schedule, and `workflow_dispatch`. The `audit` job uses `install: false` and skips the registry call when a PR did not touch dependency files. Require the **`security`** job (not `audit`): it stays green when audit is skipped and fails when audit fails. Tradeoff: a high advisory published between dependency PRs is caught by the Monday job, not by every validation.

## Workflow files

| File           | Trigger                                                                              | Role                                                                                         |
| -------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `pr.yml`       | `pull_request`                                                                       | Install → `pnpm run validate` → `pnpm run build` → Playwright Chromium + `pnpm run test:e2e` |
| `ci.yml`       | `push` to `main` / `workflow_dispatch`                                               | Per release track below                                                                      |
| `security.yml` | every `pull_request`; lockfile/`package.json` push; weekly cron; `workflow_dispatch` | `audit` + required `security` gate                                                           |
| `release.yml`  | `workflow_dispatch`                                                                  | Manual artifact releases (Poltergeist only)                                                  |

PR/CI validate jobs must call **`pnpm run validate`** (or Rust `scripts/validate`), not re-list format/lint/typecheck/test as separate steps.

PR workflows already use `concurrency` with `cancel-in-progress: true`. Do **not** add `pull_request` path filters: skipped required checks stay pending and block merge. Path filters belong on `ci.yml` `push` only.

After **`pnpm run build`**, Node apps that ship Playwright restore `~/.cache/ms-playwright` (OS + Playwright version key), install Chromium on a miss (`pnpm exec playwright install --with-deps chromium`), and only install OS libraries on a hit (`pnpm exec playwright install-deps chromium`). Then `pnpm run test:e2e`. Playwright is not part of validate. TC-Bot has no Playwright; skip those steps there.

Keep deploy-time E2E. Track A `build-and-deploy` builds with production env after a semantic-release SHA, so it is not the PR artifact. Caching Chromium is what removes the 15–25s install; the tests themselves are about a second.

## Release tracks

### A — semantic-release (in `ci.yml`)

Used by: Armory, Codex, BudgetPlanner, Outfitter, TC-Bot, AerieDrive, InfoGraphic.

- `.releaserc.json` + `version` job that runs `pnpm exec semantic-release`
- Typical job order: `deployment-check` → `version` → `validate` → `build-and-deploy` → `discord-status`
- `build-and-deploy` runs the production build, then Playwright Chromium + `pnpm run test:e2e`, then SSH deploy. TC-Bot has no Playwright.
- Path filters on `push` must include `e2e/**` and `playwright.config.ts` (and `shared/**` when the app has that tree) so those changes still deploy.
- No separate `release.yml`

### B — manual GitHub Release (`release.yml`)

Used by: Poltergeist.

- `workflow_dispatch` inputs: `version`, `prerelease`, `draft`
- Jobs: `prepare` → `build` (Windows zips) → `release` → `discord-status`
- `Swatinem/rust-cache` must use the same `shared-key` on PR and release, with `save-if: true`. The action otherwise only saves on default-branch pushes, and Poltergeist has no `ci.yml`, so releases were compiling from a cold cache.
- CI on `main` must **not** auto-publish nightly GitHub Releases

### C — direct deploy only

Used by: Homepage/clouds, shark5060.net.

- Keep push-to-prod deploy in `ci.yml`
- No semantic-release, no manual `release.yml`

### Starter

AppBase: PR checks only; no release/deploy workflows.
