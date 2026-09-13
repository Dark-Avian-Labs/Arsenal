# Dark Avian Labs org standards

Canonical engineering conventions for DAL application repositories. Copy patterns from here into sibling apps. Same mirror model as the design system: no shared npm package or org-level reusable workflow package yet.

The living PR workflow is [`.github/workflows/pr.yml`](../../.github/workflows/pr.yml). Track A CI is Armory/Codex `ci.yml`.

## Documents

| Doc                                      | Purpose                                                     |
| ---------------------------------------- | ----------------------------------------------------------- |
| [readme-template.md](readme-template.md) | Root `README.md` shape, badges, warmer intro, section order |
| [ci-pr-release.md](ci-pr-release.md)     | Blacksmith runners, action pins, three release tracks       |
| [validate.md](validate.md)               | `pnpm run validate` / Rust validate contract                |
| [personal-repos.md](personal-repos.md)   | Same conventions with **GitHub-hosted** runners             |

## Defaults

- **Node** `>=26`, **pnpm** `12.x` for TypeScript/JavaScript apps
- **Checkout** on Blacksmith: `useblacksmith/checkout@v1` (never `actions/checkout`)
- **Node + pnpm setup:** `pnpm/setup@v2` (`runtime: node@26`, `cache: true`, `require-lockfile: true`)
- **Discord:** `iShark5060/actions-discord-status@v1` on `blacksmith-2vcpu-ubuntu-2404`
- **Quality gate:** every app exposes one named validate entrypoint (`pnpm run validate` or `scripts/validate` for Rust)
- **Agent docs:** root `AGENTS.md` in each app. Design system lives in AppBase `AGENTS.md`.

Personal / non-Blacksmith repos: use [personal-repos.md](personal-repos.md) (`ubuntu-latest` / `windows-latest`, `actions/checkout@v7`).

## Design system

UI tokens and component contracts live in the root [AGENTS.md](../../AGENTS.md) (not duplicated here).
