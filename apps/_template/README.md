<p align="center">
  <img src="https://raw.githubusercontent.com/Dark-Avian-Labs/.github/refs/heads/main/banner.png" alt="Dark Avian Labs">
</p>

# AppBase

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
![Node](https://img.shields.io/badge/Node-%3E%3D26-339933?logo=node.js&logoColor=white&style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-7.x-3178C6?logo=typescript&logoColor=white&style=flat-square)
![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black&style=flat-square)
![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&logoColor=white&style=flat-square)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-06B6D4?logo=tailwindcss&logoColor=white&style=flat-square)
[![Cursor](https://img.shields.io/badge/Cursor-IDE-141414?logo=cursor&logoColor=white&style=flat-square)](https://cursor.com)

AppBase is the empty house a new Dark Avian Labs web app starts from. Glass panels, an Express API, a Vite client, Clerk sign-in, and the same buttons you see on Codex and Armory. The product features stay out on purpose.

It is for the next app, so that app copies a finished shell instead of inheriting a half-built Codex.

## Features

**The shell, and nothing else.** Layout, theme, sign-in, session, and the legal link are here. There is no collection, no budget, and no catalog to delete before you begin.

**The same sign-in shape as the hosted apps.** Clerk, a session cookie, and the allowed-origins list match the apps that already share an account. A new app can join that list instead of inventing a second login.

**A left rail ready for the lab menu.** The nav hook the other apps use is already wired, so a sibling can show up beside this one once it has a public URL.

## What you should know

The shell is `@dark-avian-labs/ui`. The HTTP stack is `@dark-avian-labs/server-kit`. Change them once.

This repo is not a public site. Nobody is meant to use an AppBase deployment as a product.

## Self-hosting

Node 26 or newer, and pnpm 12. Copy `.env.example` to `.env.development`. `pnpm --filter dal-template dev` reads that file. Clerk keys can stay empty there. Production refuses to start without them, which the example already says.

```
pnpm install
pnpm --filter dal-template dev
```

A hosted process needs `NODE_ENV=production` and `.env.production`. Fill the Clerk keys before `pnpm --filter dal-template run build`. The client bundle reads `VITE_` values at build time. Point `APP_PUBLIC_BASE_URL` and the cookie settings at the host you are actually using. The example is filled in with the lab's domains.

## License

MIT
