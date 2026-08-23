# CI, PR, and release

## Runner tiers

| Workload                                                     | Runner                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Validate, build, deploy, semantic-release, Rust compile/test | `blacksmith-8vcpu-ubuntu-2404` (Windows: `blacksmith-8vcpu-windows-2025`) |
| Notifications, cheap gates (`deployment-check`)              | `blacksmith-2vcpu-ubuntu-2404`                                            |

Do not use `ubuntu-latest` or `blacksmith-4vcpu-*` for new/updated jobs.

## Required actions

Third-party actions are **pinned to commit SHAs** with the release tag in a
trailing comment (e.g. `uses: pnpm/action-setup@0977fd99… # v6.0.10`), so a
retargeted or compromised tag cannot inject code into CI. Dependabot
(`package-ecosystem: github-actions`) keeps the pins current — it rewrites the
pinned SHA and the tag comment on every release, so do not ignore minor/patch
updates for pinned actions.

| Concern                       | Action (pin the current release SHA)                                            |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Checkout (Blacksmith jobs)    | `useblacksmith/checkout` (v1 line)                                              |
| pnpm                          | `pnpm/action-setup` (v6 line)                                                   |
| Node                          | `actions/setup-node` (v7 line, `cache: pnpm`)                                   |
| Discord status                | `iShark5060/actions-discord-status` (`job_results` + `mention_on: failure`)     |
| GitHub Release (manual track) | `iShark5060/actions-gh-release` (`upload_checksums: true` when uploading files) |

Install must be `pnpm install --frozen-lockfile`, followed by
`pnpm audit --audit-level high`. The old `.github/actions/pnpm-install-fresh`
composite (delete `pnpm-lock.yaml`, then `pnpm install`) is **deprecated**: it
discards the lockfile's supply-chain guarantees on every CI run. It existed to
work around `--frozen-lockfile` failures after semantic-release version
bumps — but pnpm does not record the root package version in `pnpm-lock.yaml`,
so a version-only bump cannot desync the lockfile. If `--frozen-lockfile`
fails, the lockfile genuinely drifted from `package.json` (dependency edited
without running `pnpm install`, or CI uses a different pnpm major than the one
that wrote the lockfile — keep `packageManager` exact); fix the drift instead
of deleting the lockfile.

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
- Pattern references: NiTTY / 7-Zip release workflows
- CI on `main` must **not** auto-publish nightly GitHub Releases

### C — direct deploy only

Used by: Homepage/clouds, shark5060.net.

- Keep push-to-prod deploy in `ci.yml`
- No semantic-release, no manual `release.yml`

### Starter

AppBase: PR checks only; no release/deploy workflows.

## Templates

See [workflow-templates/](workflow-templates/).
