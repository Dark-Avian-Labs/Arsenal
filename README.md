<p align="center">
  <img src="https://raw.githubusercontent.com/Dark-Avian-Labs/.github/refs/heads/main/banner.png" alt="Dark Avian Labs">
</p>

# AppBase

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![PR](https://img.shields.io/github/actions/workflow/status/Dark-Avian-Labs/AppBase/pr.yml?style=flat-square&label=PR)](https://github.com/Dark-Avian-Labs/AppBase/actions/workflows/pr.yml)
![Node](https://img.shields.io/badge/Node-%3E%3D26-339933?logo=node.js&logoColor=white&style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-7.x-3178C6?logo=typescript&logoColor=white&style=flat-square)
![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black&style=flat-square)
![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&logoColor=white&style=flat-square)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-06B6D4?logo=tailwindcss&logoColor=white&style=flat-square)
[![Cursor](https://img.shields.io/badge/Cursor-IDE-141414?logo=cursor&logoColor=white&style=flat-square)](https://cursor.com)

Starter for Dark Avian Labs web apps. Ships the glass shell, Express baseline, and Clerk wiring. Domain features are empty on purpose. There is no shared UI package — sibling apps copy these contracts by hand.

Default API port is **3000**. Vite is **5173**.

## Gotchas

- Encrypted `.env.development` / `.env.production` need `.env.keys` or `DOTENV_PRIVATE_KEY_*`. Never encrypt `VITE_*` — unwrapped Vite reads ciphertext.
- `pnpm start` loads `.env.production` only when `NODE_ENV=production`. Without that it loads the development file.
- Empty Clerk keys skip auth (fine in dev). Placeholder keys (`pk_test_placeholder`) are fatal — leave them empty, do not fake values. Once keys are set, `APP_PUBLIC_BASE_URL` is required.
- Production login is shared across DAL apps via `COOKIE_DOMAIN=.darkavianlabs.com`. Admin is Clerk public metadata `apps.<APP_ID> === 'admin'`; the session token must include `"metadata": "{{user.public_metadata}}"`.
- After changing Node versions on Windows, `pnpm rebuild better-sqlite3`.
- Design system and porting contracts: [AGENTS.md](AGENTS.md). Org CI/README/validate: [docs/org-standards/](docs/org-standards/).

## License

MIT
