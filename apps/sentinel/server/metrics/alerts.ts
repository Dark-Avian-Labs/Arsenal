import { log } from '@dark-avian-labs/server-kit';

import { SENTINEL_DISCORD_WEBHOOK } from '../config.ts';
import type { ExitEvent, HttpSample, ProcessSample } from './ingestSchema.ts';

const ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const LAG_P95_THRESHOLD_MS = 500;
const HTTP_5XX_BURST_THRESHOLD = 5;

const lastSentAt = new Map<string, number>();

export function resetAlertCooldowns(): void {
  lastSentAt.clear();
}

export function shouldSendAlert(key: string, now = Date.now()): boolean {
  const prev = lastSentAt.get(key);
  if (prev != null && now - prev < ALERT_COOLDOWN_MS) return false;
  lastSentAt.set(key, now);
  return true;
}

async function postDiscordAlert(title: string, detail: string): Promise<void> {
  if (!SENTINEL_DISCORD_WEBHOOK) return;
  try {
    const res = await fetch(SENTINEL_DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: `**[Sentinel] ${title}**\n${detail}`,
        allowed_mentions: { parse: [] },
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      log('warn', 'sentinel_alert_failed', { status: res.status });
    }
  } catch (err) {
    log('warn', 'sentinel_alert_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function notifyExitAlert(
  appId: string,
  displayName: string,
  message: string,
): Promise<void> {
  if (!SENTINEL_DISCORD_WEBHOOK) return;
  if (!shouldSendAlert(`${appId}:crash`)) return;
  await postDiscordAlert(`${displayName} crashed`, message);
}

export function evaluateIngestAlerts(samples: Array<ProcessSample | HttpSample | ExitEvent>): void {
  if (!SENTINEL_DISCORD_WEBHOOK) return;
  const now = Date.now();
  for (const sample of samples) {
    const label = sample.displayName || sample.appId;
    if (sample.kind === 'exit' && sample.exitKind === 'crash') {
      if (shouldSendAlert(`${sample.appId}:crash`, now)) {
        void postDiscordAlert(
          `${label} crashed`,
          sample.message || `exit code ${sample.exitCode ?? 'unknown'}`,
        );
      }
      continue;
    }
    if (
      sample.kind === 'http' &&
      sample.statusClass === '5xx' &&
      sample.count >= HTTP_5XX_BURST_THRESHOLD
    ) {
      if (shouldSendAlert(`${sample.appId}:5xx:${sample.routePattern}`, now)) {
        void postDiscordAlert(
          `${label} 5xx burst on ${sample.method} ${sample.routePattern}`,
          `${sample.count} server errors in the last reporting window.`,
        );
      }
      continue;
    }
    if (
      sample.kind === 'process' &&
      typeof sample.lagP95Ms === 'number' &&
      sample.lagP95Ms >= LAG_P95_THRESHOLD_MS
    ) {
      if (shouldSendAlert(`${sample.appId}:lag`, now)) {
        void postDiscordAlert(
          `${label} event-loop lag spike`,
          `p95 lag reached ${Math.round(sample.lagP95Ms)}ms.`,
        );
      }
    }
  }
}
