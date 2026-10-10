<p align="center">
  <img src="https://raw.githubusercontent.com/Dark-Avian-Labs/.github/refs/heads/main/banner.png" alt="Dark Avian Labs">
</p>

# Sentinel

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
![Node](https://img.shields.io/badge/Node-%3E%3D26-339933?logo=node.js&logoColor=white&style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-7.x-3178C6?logo=typescript&logoColor=white&style=flat-square)
![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black&style=flat-square)
![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&logoColor=white&style=flat-square)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-06B6D4?logo=tailwindcss&logoColor=white&style=flat-square)
[![Cursor](https://img.shields.io/badge/Cursor-IDE-141414?logo=cursor&logoColor=white&style=flat-square)](https://cursor.com)

Sentinel is the dashboard for the Node apps Dark Avian Labs runs under PM2. CPU, memory, HTTP latency, event-loop lag, and restarts show up as charts on the machine that hosts the fleet.

It is for the person who wants the graphs when something feels slow, without standing up a second monitoring stack.

## Features

**A fleet list.** Each app shows how many restarts and crashes it had in the last day. Open one for the charts.

**The numbers that explain a stall.** CPU and memory sit next to HTTP p95 latency and event-loop lag. A process can look idle on CPU and still be late on requests. Both are on the same page.

**Restarts and crashes, split apart.** A clean restart and a crash are different events. The app page lists them for the time range you picked.

**Samples from the apps themselves.** Hosted apps can post metrics to `/api/ingest`. A PM2 bridge on the server host can do the same. The charts are whatever those samples contain.

## What you should know

The dashboard is limited to admin accounts. A normal Dark Avian Labs sign-in is not enough. The same account system is the one Codex and Armory use. The left rail still jumps between the hosted apps.

Ping and error digests stay in pm2-discord. Sentinel is the page you open for the graphs.

The charts stay empty until something posts a sample. A fresh install shows the empty state on purpose.

Live: [sentinel.darkavianlabs.com](https://sentinel.darkavianlabs.com)

## Self-hosting

Node 26 or newer, and pnpm 12. Copy `.env.example` to `.env.development`. `pnpm dev` reads that file. Production refuses to start without Clerk keys, and the example already says so.

```
pnpm install
pnpm dev
```

Set `SENTINEL_INGEST_TOKEN` and give that same token to each app or to the PM2 bridge. A hosted process needs `NODE_ENV=production` and `.env.production`. Fill the Clerk keys before `pnpm run build`, because the client bundle reads `VITE_` values at build time. Sentinel only sees processes that can reach its ingest URL, so it belongs on the host that runs the fleet, or somewhere those agents can post to.

## License

MIT
