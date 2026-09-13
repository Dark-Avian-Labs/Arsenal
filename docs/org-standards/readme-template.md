# README template

Use this shape for every DAL app `README.md`. Domain-only sections go after Gotchas and before License.

```markdown
<p align="center">
  <img src="https://raw.githubusercontent.com/Dark-Avian-Labs/.github/refs/heads/main/banner.png" alt="Dark Avian Labs">
</p>

# <ProductName>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/Dark-Avian-Labs/<repo>/ci.yml?style=flat-square&label=CI)](https://github.com/Dark-Avian-Labs/<repo>/actions/workflows/ci.yml)
[![PR](https://img.shields.io/github/actions/workflow/status/Dark-Avian-Labs/<repo>/pr.yml?style=flat-square&label=PR)](https://github.com/Dark-Avian-Labs/<repo>/actions/workflows/pr.yml)
![Node](https://img.shields.io/badge/Node-%3E%3D26-339933?logo=node.js&logoColor=white&style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-7.x-3178C6?logo=typescript&logoColor=white&style=flat-square)
![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black&style=flat-square)
![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&logoColor=white&style=flat-square)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-06B6D4?logo=tailwindcss&logoColor=white&style=flat-square)
[![Cursor](https://img.shields.io/badge/Cursor-IDE-141414?logo=cursor&logoColor=white&style=flat-square)](https://cursor.com)

<Warm intro, about 6–8 sentences. What the app is for, who it is for, and one concrete thing you can do with it. Live URL on its own line if the app is hosted.>

## Gotchas

- Only things that bite at boot, deploy, or first run. Env names live in `.env.example`; scripts live in `package.json`.

## License

MIT
```

## Conventions

- Shared org banner first (`banner.png` in `Dark-Avian-Labs/.github`), then H1 = product name only.
- Badges under H1: License + CI/PR (when those workflows exist) + runtime/stack + Cursor. All shields use `style=flat-square`. GitHub's own workflow SVGs cannot be restyled; use the shields.io `github/actions/workflow/status` URLs above.
- Drop Requirements, Quick start, Examples, Environment tables, and Scripts tables. Readers already know how to run a Node app.
- Omit empty stubs. One extra domain heading is fine when it is actually needed (Poltergeist editions, TC-Bot Sheets, etc.).
- Rust apps: swap Node/TS/React badges for Rust edition and platform; quality gate is `scripts/validate`.
- Banner is the shared org strip at `https://raw.githubusercontent.com/Dark-Avian-Labs/.github/refs/heads/main/banner.png`. Do not invent a per-repo image.
- Do not link `AGENTS.md` or `docs/org-standards/` from the README. Those are for agents, not GitHub visitors.
- Do not mention sign-in. Hosted apps show it on first load.
