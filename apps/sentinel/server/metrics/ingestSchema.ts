export type ExitKind = 'graceful' | 'crash';

export type ProcessSample = {
  kind: 'process';
  appId: string;
  displayName?: string;
  pm2Name?: string;
  pmxModule?: boolean;
  ts?: number;
  cpu?: number;
  rssMb?: number;
  heapMb?: number;
  heapTotalMb?: number;
  heapExternalMb?: number;
  lagP50Ms?: number;
  lagP95Ms?: number;
  lagMaxMs?: number;
  elu?: number;
  uptimeSec?: number;
  gcP95Ms?: number;
  status?: string;
};

export type HttpSample = {
  kind: 'http';
  appId: string;
  displayName?: string;
  ts?: number;
  method: string;
  routePattern: string;
  statusClass: string;
  count: number;
  latencyP50Ms?: number;
  latencyP95Ms?: number;
  latencyMaxMs?: number;
};

export type ExitEvent = {
  kind: 'exit';
  appId: string;
  displayName?: string;
  ts?: number;
  exitKind: ExitKind;
  exitCode?: number;
  signal?: string;
  message?: string;
  source?: string;
};

export type IngestPayload = {
  samples?: Array<ProcessSample | HttpSample | ExitEvent>;
};

const FORBIDDEN_KEYS = new Set([
  'ip',
  'userId',
  'user_id',
  'email',
  'cookie',
  'cookies',
  'authorization',
  'query',
  'url',
  'body',
  'headers',
  'path',
  'sessionId',
  'session_id',
]);

const STATUS_CLASS_RE = /^[1-5]xx$/;
const METHOD_RE = /^[A-Z]{1,16}$/;
const ROUTE_RE = /^\/[A-Za-z0-9_.:\-/{}$*]*$/;
const APP_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectForbiddenKeys(obj: Record<string, unknown>): string | null {
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.has(key) || FORBIDDEN_KEYS.has(key.toLowerCase())) {
      return `forbidden field: ${key}`;
    }
  }
  return null;
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' ? value.trim() : undefined;
}

function readNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const value = obj[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizeMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  const trimmed = message.replace(/\s+/g, ' ').trim().slice(0, 200);
  return trimmed.length > 0 ? trimmed : undefined;
}

export type ParsedIngest = {
  samples: Array<ProcessSample | HttpSample | ExitEvent>;
};

export function parseIngestBody(
  body: unknown,
): { ok: true; value: ParsedIngest } | { ok: false; error: string } {
  if (!isPlainObject(body)) {
    return { ok: false, error: 'body must be an object' };
  }
  const forbidden = rejectForbiddenKeys(body);
  if (forbidden) return { ok: false, error: forbidden };

  const rawSamples = body.samples;
  if (!Array.isArray(rawSamples)) {
    return { ok: false, error: 'samples must be an array' };
  }
  if (rawSamples.length === 0 || rawSamples.length > 200) {
    return { ok: false, error: 'samples length must be 1..200' };
  }

  const samples: Array<ProcessSample | HttpSample | ExitEvent> = [];

  for (const item of rawSamples) {
    if (!isPlainObject(item)) {
      return { ok: false, error: 'each sample must be an object' };
    }
    const itemForbidden = rejectForbiddenKeys(item);
    if (itemForbidden) return { ok: false, error: itemForbidden };

    const kind = readString(item, 'kind');
    const appId = readString(item, 'appId');
    if (!appId || !APP_ID_RE.test(appId)) {
      return { ok: false, error: 'invalid appId' };
    }
    const displayName = readString(item, 'displayName');
    const ts = readNumber(item, 'ts');

    if (kind === 'process') {
      samples.push({
        kind: 'process',
        appId,
        displayName,
        pm2Name: readString(item, 'pm2Name'),
        ts,
        cpu: readNumber(item, 'cpu'),
        rssMb: readNumber(item, 'rssMb'),
        heapMb: readNumber(item, 'heapMb'),
        heapTotalMb: readNumber(item, 'heapTotalMb'),
        heapExternalMb: readNumber(item, 'heapExternalMb'),
        lagP50Ms: readNumber(item, 'lagP50Ms'),
        lagP95Ms: readNumber(item, 'lagP95Ms'),
        lagMaxMs: readNumber(item, 'lagMaxMs'),
        elu: readNumber(item, 'elu'),
        uptimeSec: readNumber(item, 'uptimeSec'),
        gcP95Ms: readNumber(item, 'gcP95Ms'),
        status: readString(item, 'status'),
      });
      continue;
    }

    if (kind === 'http') {
      const method = readString(item, 'method');
      const routePattern = readString(item, 'routePattern');
      const statusClass = readString(item, 'statusClass');
      const count = readNumber(item, 'count');
      if (!method || !METHOD_RE.test(method)) {
        return { ok: false, error: 'invalid http method' };
      }
      if (!routePattern || routePattern.includes('?') || !ROUTE_RE.test(routePattern)) {
        return { ok: false, error: 'invalid routePattern' };
      }
      if (!statusClass || !STATUS_CLASS_RE.test(statusClass)) {
        return { ok: false, error: 'invalid statusClass' };
      }
      if (count == null || count < 1 || count > 1_000_000) {
        return { ok: false, error: 'invalid http count' };
      }
      samples.push({
        kind: 'http',
        appId,
        displayName,
        ts,
        method,
        routePattern,
        statusClass,
        count,
        latencyP50Ms: readNumber(item, 'latencyP50Ms'),
        latencyP95Ms: readNumber(item, 'latencyP95Ms'),
        latencyMaxMs: readNumber(item, 'latencyMaxMs'),
      });
      continue;
    }

    if (kind === 'exit') {
      const exitKind = readString(item, 'exitKind');
      if (exitKind !== 'graceful' && exitKind !== 'crash') {
        return { ok: false, error: 'invalid exitKind' };
      }
      samples.push({
        kind: 'exit',
        appId,
        displayName,
        ts,
        exitKind,
        exitCode: readNumber(item, 'exitCode'),
        signal: readString(item, 'signal')?.slice(0, 32),
        message: sanitizeMessage(readString(item, 'message')),
        source: readString(item, 'source') ?? 'agent',
      });
      continue;
    }

    return { ok: false, error: 'invalid sample kind' };
  }

  return { ok: true, value: { samples } };
}
