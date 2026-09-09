# Validate contract

Every app exposes one named quality gate that CI and agents run before merge. AppBase implements it as `run-quality-checks.mjs` (`pnpm run validate`). Copy that script; do not re-list the steps in the workflow YAML.

## TypeScript / JavaScript

1. Runtime preflight (`scripts/runtime-preflight.mjs`) when the app has native modules or a `packageManager` pin
2. `pnpm run check-format` (oxfmt)
3. `pnpm run lint` (oxlint)
4. `pnpm run typecheck`
5. Tests — `pnpm run test:coverage` when `CI=true`, otherwise `pnpm run test`. Omit this step when the repo has no test suite yet; do not invent an empty Vitest suite.

CI then runs **`pnpm run build`** as a separate step after validate.

Playwright is **not** inside validate. PR/CI install Chromium and run `pnpm run test:e2e` **after** `pnpm run build` (the e2e webServer boots `dist/server/index.js`).

Prefer **oxlint** + **oxfmt** over ESLint/Prettier for new and migrated JS/TS apps.

## Rust (`scripts/validate`)

Poltergeist (and similar):

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
```

Expose as `scripts/validate` (bash) and/or `scripts/validate.ps1` so agents have one command. PR workflows call that script.
