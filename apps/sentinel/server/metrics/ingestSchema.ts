import { z } from 'zod';

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

const optionalNumber = z.preprocess(
  (value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined),
  z.number().optional(),
);

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : undefined),
  z.string().optional(),
);

const appIdSchema = z.string().trim().regex(APP_ID_RE);

const processSampleSchema = z.object({
  kind: z.literal('process'),
  appId: appIdSchema,
  displayName: optionalText,
  pm2Name: optionalText,
  ts: optionalNumber,
  cpu: optionalNumber,
  rssMb: optionalNumber,
  heapMb: optionalNumber,
  heapTotalMb: optionalNumber,
  heapExternalMb: optionalNumber,
  lagP50Ms: optionalNumber,
  lagP95Ms: optionalNumber,
  lagMaxMs: optionalNumber,
  elu: optionalNumber,
  uptimeSec: optionalNumber,
  gcP95Ms: optionalNumber,
  status: optionalText,
});

const httpSampleSchema = z.object({
  kind: z.literal('http'),
  appId: appIdSchema,
  displayName: optionalText,
  ts: optionalNumber,
  method: z.string().trim().regex(METHOD_RE),
  routePattern: z
    .string()
    .trim()
    .refine((value) => !value.includes('?') && ROUTE_RE.test(value)),
  statusClass: z.string().trim().regex(STATUS_CLASS_RE),
  count: z.number().gte(1).lte(1_000_000),
  latencyP50Ms: optionalNumber,
  latencyP95Ms: optionalNumber,
  latencyMaxMs: optionalNumber,
});

const exitSampleSchema = z.object({
  kind: z.literal('exit'),
  appId: appIdSchema,
  displayName: optionalText,
  ts: optionalNumber,
  exitKind: z.enum(['graceful', 'crash']),
  exitCode: optionalNumber,
  signal: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().slice(0, 32) : undefined),
    z.string().optional(),
  ),
  message: z.preprocess((value) => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.replace(/\s+/g, ' ').trim().slice(0, 200);
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().optional()),
  source: optionalText,
});

const sampleSchema = z.discriminatedUnion('kind', [
  processSampleSchema,
  httpSampleSchema,
  exitSampleSchema,
]);

export type ParsedIngest = {
  samples: Array<ProcessSample | HttpSample | ExitEvent>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function forbiddenField(obj: Record<string, unknown>): string | null {
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.has(key) || FORBIDDEN_KEYS.has(key.toLowerCase())) {
      return `forbidden field: ${key}`;
    }
  }
  return null;
}

function sampleError(error: z.ZodError): string {
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (field === 'method') return 'invalid http method';
    if (field === 'routePattern') return 'invalid routePattern';
    if (field === 'statusClass') return 'invalid statusClass';
    if (field === 'count') return 'invalid http count';
    if (field === 'exitKind') return 'invalid exitKind';
    if (field === 'appId') return 'invalid appId';
  }
  return 'invalid sample kind';
}

export function parseIngestBody(
  body: unknown,
): { ok: true; value: ParsedIngest } | { ok: false; error: string } {
  if (!isPlainObject(body)) {
    return { ok: false, error: 'body must be an object' };
  }
  const forbidden = forbiddenField(body);
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
    const itemForbidden = forbiddenField(item);
    if (itemForbidden) return { ok: false, error: itemForbidden };
    const parsed = sampleSchema.safeParse(item);
    if (!parsed.success) return { ok: false, error: sampleError(parsed.error) };
    if (parsed.data.kind === 'exit') {
      samples.push({ ...parsed.data, source: parsed.data.source ?? 'agent' });
      continue;
    }
    samples.push(parsed.data);
  }

  return { ok: true, value: { samples } };
}
