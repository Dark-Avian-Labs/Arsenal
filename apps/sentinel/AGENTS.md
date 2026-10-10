# Sentinel

Shell, auth, env, and validate are in the repo `AGENTS.md`. Port 3005. Vite 5176. Signed-out Playwright is 3105. There is no signed-in project.

PM2 monitor for DAL Node apps on one host. Alerts and logs stay with `pm2-discord`. Sentinel does not notify and does not ship logs.

`POST /api/ingest` uses `SENTINEL_INGEST_TOKEN` as a Bearer token. Metrics are `data/metrics.db`.

Ingest and the agent must not send IPs, user ids, emails, cookies, Authorization headers, bodies, full URLs, or query strings. HTTP dimensions are method, route pattern, status class, and latency buckets.

The agent is `@dark-avian-labs/sentinel-agent`. The server loads its `dist` build. App releases are tags named `<app>-vX.Y.Z`.
