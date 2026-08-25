# CI, PR, and release

Policy for new and updated workflows. The living PR workflow is AppBase [`.github/workflows/pr.yml`](../../.github/workflows/pr.yml). Track A `ci.yml` lives in Armory/Codex.

## Runner tiers

| Workload                                                     | Runner                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Validate, build, deploy, semantic-release, Rust compile/test | `blacksmith-8vcpu-ubuntu-2404` (Windows: `blacksmith-8vcpu-windows-2025`) |
| Notifications, cheap gates (`deployment-check`)              | `blacksmith-2vcpu-ubuntu-2404`                                            |

Do not use `ubuntu-latest` or `blacksmith-4vcpu-*` for new/updated DAL jobs.

## Required actions

Third-party actions are **pinned to commit SHAs** with the release tag in a trailing comment. Dependabot (`package-ecosystem: github-actions`) rewrites the SHA and the tag comment; do not ignore minor/patch updates for pinned actions.

| Concern                       | Action (pin the current release SHA)                                            |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Checkout (Blacksmith jobs)    | `useblacksmith/checkout` (v1 line)                                              |
| pnpm                          | `pnpm/action-setup` (v6 line)                                                   |
| Node                          | `actions/setup-node` (v7 line, `cache: pnpm`)                                   |
| Discord status                | `iShark5060/actions-discord-status` (`job_results` + `mention_on: failure`)     |
| GitHub Release (manual track) | `iShark5060/actions-gh-release` (`upload_checksums: true` when uploading files) |

Install is `pnpm install --frozen-lockfile`, then `pnpm audit --audit-level high`. If frozen-lockfile fails, the lockfile drifted; fix that. Do not delete `pnpm-lock.yaml` on each CI run.

## Workflow files

| File          | Trigger                                | Role                                                                           |
| ------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| `pr.yml`      | `pull_request`                         | Install → `pnpm run validate` → `pnpm run build` (+ coverage when tests exist) |
| `ci.yml`      | `push` to `main` / `workflow_dispatch` | Per release track below                                                        |
| `release.yml` | `workflow_dispatch`                    | Manual artifact releases (Poltergeist only)                                    |

PR/CI validate jobs must call **`pnpm run validate`** (or Rust `scripts/validate`), not re-list format/lint/typecheck/test as separate steps.

## Release tracks

### A — semantic-release (in `ci.yml`)

Used by: Armory, Codex, TC-Bot, AerieDrive, InfoGraphic.

- `.releaserc.json` + `version` job that runs `pnpm exec semantic-release`
- Typical job order: `deployment-check` → `version` → `validate` → `build-and-deploy` → `discord-status`
- No separate `release.yml`

### B — manual GitHub Release (`release.yml`)

Used by: Poltergeist.

- `workflow_dispatch` inputs: `version`, `prerelease`, `draft`
- Jobs: `prepare` → `build` (Windows zips) → `release` → `discord-status`
- CI on `main` must **not** auto-publish nightly GitHub Releases

### C — direct deploy only

Used by: Homepage/clouds, shark5060.net.

- Keep push-to-prod deploy in `ci.yml`
- No semantic-release, no manual `release.yml`

### Starter

AppBase: PR checks only; no release/deploy workflows.
