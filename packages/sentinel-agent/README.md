# @dark-avian-labs/sentinel-agent

In-process agent for Sentinel. Collects event-loop lag, HTTP latency by route pattern, and graceful vs crash exit events. Never sends IPs, user ids, query strings, cookies, or bodies.

## Install

Apps in this repo depend on it with `"@dark-avian-labs/sentinel-agent": "workspace:*"`. Node loads `dist/index.js`. App releases are tags named `<app>-vX.Y.Z` and do not publish this package.

Other repos install the GitHub release tarball. `.github/workflows/release.yml` packs it as `agent-vX.Y.Z`.

```json
"@dark-avian-labs/sentinel-agent": "https://github.com/Dark-Avian-Labs/Arsenal/releases/download/agent-vX.Y.Z/dark-avian-labs-sentinel-agent-X.Y.Z.tgz"
```

## Usage

```ts
import { createSentinelAgent } from '@dark-avian-labs/sentinel-agent';

const agent = createSentinelAgent({
  appId: 'outfitter',
  displayName: 'Outfitter',
  ingestUrl: 'http://127.0.0.1:3005/api/ingest',
  token: process.env.SENTINEL_INGEST_TOKEN!,
});

app.use(agent.middleware);
agent.start();

process.on('SIGTERM', () => {
  agent.noteGracefulExit('SIGTERM');
});
process.on('uncaughtException', (err) => {
  agent.noteCrash(err);
});
```
