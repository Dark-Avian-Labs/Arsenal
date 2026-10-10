# Sentinel

Shell, auth, env, and validate are in AppBase `AGENTS.md`. Port 3005. Vite 5176.

PM2 monitor for DAL Node apps on one host. Alerts and logs stay with `pm2-discord`. Sentinel does not notify and does not ship logs.

`POST /api/ingest` uses `SENTINEL_INGEST_TOKEN` and is mounted above CSRF. Metrics are `data/metrics.db`, separate from sessions.

Ingest and the agent must not send IPs, user ids, emails, cookies, Authorization headers, bodies, full URLs, or query strings. HTTP dimensions are method, route pattern, status class, and latency buckets.

The in-app agent publishes as a Forgejo release tagged `agent-v*`. App releases are semantic-release `v*` and do not include the agent tarball. Sibling apps install from that tarball, or from `file:../Sentinel/packages/agent` while iterating.
