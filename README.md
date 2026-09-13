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

AppBase is the empty house the other Dark Avian Labs web apps grow up in. Glass shell, Express API, Vite client, the same buttons and panels you see on Codex and Armory. Domain features stay out on purpose, so a new app copies the look instead of inheriting a half-finished product.

There is no shared UI package. When the glass or layout changes here, the same change lands in the sibling apps by hand.

## Gotchas

- Encrypted env files need `.env.keys`. Leave `VITE_*` plaintext or Vite reads ciphertext.
- `pnpm start` only loads `.env.production` when `NODE_ENV=production`.

## License

MIT
