import { describe, expect, it } from 'vitest';

import { parseIngestBody } from './ingestSchema.js';

describe('parseIngestBody', () => {
  it('accepts process, http, and exit samples', () => {
    const parsed = parseIngestBody({
      samples: [
        {
          kind: 'process',
          appId: 'codex',
          cpu: 12.5,
          rssMb: 180,
          elu: 0.42,
          heapTotalMb: 200,
          heapExternalMb: 12,
          uptimeSec: 3600,
          gcP95Ms: 3.2,
        },
        {
          kind: 'http',
          appId: 'codex',
          method: 'GET',
          routePattern: '/api/items/:id',
          statusClass: '2xx',
          count: 3,
          latencyP95Ms: 42,
        },
        { kind: 'exit', appId: 'codex', exitKind: 'graceful', exitCode: 0, signal: 'SIGTERM' },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.samples).toHaveLength(3);
  });

  it('rejects PII-shaped fields and raw paths with query strings', () => {
    expect(parseIngestBody({ samples: [{ kind: 'process', appId: 'x', userId: 'u1' }] }).ok).toBe(false);
    expect(
      parseIngestBody({
        samples: [
          {
            kind: 'http',
            appId: 'codex',
            method: 'GET',
            routePattern: '/api/items?user=1',
            statusClass: '2xx',
            count: 1,
          },
        ],
      }).ok,
    ).toBe(false);
  });
});
