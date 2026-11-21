import { spawn } from 'node:child_process';
import os from 'node:os';

import { log } from '@dark-avian-labs/server-kit';

import { SENTINEL_PM2_BRIDGE_INTERVAL_MS } from '../config.ts';
import { notifyExitAlert } from '../metrics/alerts.ts';
import { getMetricsDb } from '../metrics/db.ts';
import type { ExitKind } from '../metrics/ingestSchema.ts';
import { writeExitEvent, writeHostSample, writeProcessSample } from '../metrics/writer.ts';

type Pm2Process = {
  name?: string;
  pm_id?: number;
  pid?: number;
  pm2_env?: {
    status?: string;
    restart_time?: number;
    unstable_restarts?: number;
    pm_uptime?: number;
    exit_code?: number;
    pmx_module?: boolean;
  };
  monit?: {
    cpu?: number;
    memory?: number;
  };
};

export function classifyPm2Restart(input: {
  status: string;
  exitCode?: number;
  prevUnstableRestarts: number;
  unstableRestarts: number;
}): ExitKind {
  if (typeof input.exitCode === 'number' && input.exitCode !== 0) return 'crash';
  if (input.unstableRestarts > input.prevUnstableRestarts) return 'crash';
  if (input.status === 'errored') return 'crash';
  return 'graceful';
}

function slugifyAppId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function readPm2List(): Promise<Pm2Process[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'pm2.cmd' : 'pm2', ['jlist'], {
      windowsHide: true,
      timeout: 8000,
      killSignal: 'SIGKILL',
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `pm2 jlist exited ${code}`));
        return;
      }
      try {
        const parsed: unknown = JSON.parse(stdout);
        resolve(Array.isArray(parsed) ? (parsed as Pm2Process[]) : []);
      } catch (err) {
        reject(err);
      }
    });
  });
}

function writeHostSnapshot(now: number): void {
  const loads = os.loadavg();
  const total = os.totalmem();
  const free = os.freemem();
  const usedPct = total > 0 ? ((total - free) / total) * 100 : undefined;
  writeHostSample(getMetricsDb(), {
    ts: now,
    load1: loads[0],
    load5: loads[1],
    load15: loads[2],
    memUsedPct: usedPct,
    memTotalMb: total / (1024 * 1024),
    memFreeMb: free / (1024 * 1024),
  });
}

const lastRestartState = new Map<string, { restarts: number; unstable: number }>();

async function pollOnce(): Promise<void> {
  const list = await readPm2List();
  const db = getMetricsDb();
  const now = Date.now();
  const crashAlerts: Array<{ appId: string; displayName: string; message: string }> = [];

  db.transaction(() => {
    writeHostSnapshot(now);

    for (const proc of list) {
      const name = proc.name?.trim();
      if (!name) continue;
      const appId = slugifyAppId(name);
      const status = proc.pm2_env?.status ?? 'unknown';
      const cpu = proc.monit?.cpu;
      const memory = proc.monit?.memory;
      const rssMb = typeof memory === 'number' ? memory / (1024 * 1024) : undefined;
      const restartTime = proc.pm2_env?.restart_time ?? 0;
      const unstableRestarts = proc.pm2_env?.unstable_restarts ?? 0;
      const pmUptime = proc.pm2_env?.pm_uptime;
      const uptimeSec =
        typeof pmUptime === 'number' && pmUptime > 0
          ? Math.max(0, (now - pmUptime) / 1000)
          : undefined;

      writeProcessSample(db, {
        kind: 'process',
        appId,
        displayName: name,
        pm2Name: name,
        pmxModule: proc.pm2_env?.pmx_module === true,
        ts: now,
        cpu: typeof cpu === 'number' ? cpu : undefined,
        rssMb,
        uptimeSec,
        status,
      });

      const prev = lastRestartState.get(appId);
      if (prev != null && restartTime > prev.restarts) {
        const exitCode = proc.pm2_env?.exit_code;
        const kind = classifyPm2Restart({
          status,
          exitCode: typeof exitCode === 'number' ? exitCode : undefined,
          prevUnstableRestarts: prev.unstable,
          unstableRestarts,
        });
        const message = `pm2 restart_time ${prev.restarts} -> ${restartTime}${
          typeof exitCode === 'number' ? ` (exit ${exitCode})` : ''
        }`;
        writeExitEvent(db, {
          kind: 'exit',
          appId,
          displayName: name,
          ts: now,
          exitKind: kind,
          exitCode: typeof exitCode === 'number' ? exitCode : undefined,
          source: 'pm2',
          message,
        });
        if (kind === 'crash') {
          crashAlerts.push({ appId, displayName: name, message });
        }
      }
      lastRestartState.set(appId, { restarts: restartTime, unstable: unstableRestarts });
    }
  })();

  for (const alert of crashAlerts) {
    void notifyExitAlert(alert.appId, alert.displayName, alert.message);
  }
}

export type Pm2BridgeHandle = {
  stop: () => void;
};

const HOST_SNAPSHOT_INTERVAL_MS = 15_000;

export function startPm2Bridge(intervalMs = SENTINEL_PM2_BRIDGE_INTERVAL_MS): Pm2BridgeHandle {
  let stopped = false;
  let pm2Timer: ReturnType<typeof setInterval> | null = null;
  let hostTimer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;

  const tickPm2 = () => {
    if (inFlight) return;
    inFlight = true;
    void pollOnce()
      .catch((err) => {
        log('warn', 'pm2_bridge_poll_failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        try {
          writeHostSnapshot(Date.now());
        } catch {}
      })
      .finally(() => {
        inFlight = false;
      });
  };

  if (intervalMs > 0) {
    tickPm2();
    pm2Timer = setInterval(tickPm2, intervalMs);
    pm2Timer.unref?.();
  }

  hostTimer = setInterval(() => {
    try {
      writeHostSnapshot(Date.now());
    } catch {}
  }, HOST_SNAPSHOT_INTERVAL_MS);
  hostTimer.unref?.();

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (pm2Timer) clearInterval(pm2Timer);
      if (hostTimer) clearInterval(hostTimer);
      pm2Timer = null;
      hostTimer = null;
    },
  };
}
