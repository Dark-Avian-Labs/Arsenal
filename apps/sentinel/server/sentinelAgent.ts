import { createSentinelAgent } from '@dark-avian-labs/sentinel-agent';

import { APP_ID, APP_NAME, NODE_ENV } from './config.js';

type AgentHandle = ReturnType<typeof createSentinelAgent>;

export function createAppSentinelAgent(): AgentHandle | null {
  if (NODE_ENV === 'test') return null;
  const token = process.env.SENTINEL_INGEST_TOKEN?.trim() ?? '';
  const ingestUrl =
    process.env.SENTINEL_INGEST_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT || '3005'}/api/ingest`;
  if (!token) return null;
  return createSentinelAgent({
    appId: APP_ID,
    displayName: APP_NAME,
    ingestUrl,
    token,
  });
}
