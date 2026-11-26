import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config.ts')>();
  return {
    ...actual,
    SENTINEL_DISCORD_WEBHOOK: 'https://discord.example/webhook',
  };
});

import { evaluateIngestAlerts, resetAlertCooldowns, shouldSendAlert } from './alerts.ts';

describe('sentinel alerts', () => {
  beforeEach(() => {
    resetAlertCooldowns();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('suppresses duplicate alerts inside the 10-minute cooldown window per key', () => {
    expect(shouldSendAlert('armory:crash', 1_000)).toBe(true);
    expect(shouldSendAlert('armory:crash', 60_000)).toBe(false);
    expect(shouldSendAlert('codex:crash', 60_000)).toBe(true);
    expect(shouldSendAlert('armory:crash', 1_000 + 10 * 60 * 1000)).toBe(true);
  });

  it('fires Discord webhook alerts for crashes, 5xx bursts (>=5), and lag spikes (>=500ms) and ignores below-threshold samples', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    evaluateIngestAlerts([
      // Below threshold: must NOT fire
      { kind: 'exit', appId: 'codex', ts: Date.now(), exitKind: 'graceful', exitCode: 0 },
      {
        kind: 'http',
        appId: 'codex',
        ts: Date.now(),
        method: 'GET',
        routePattern: '/api/a',
        statusClass: '5xx',
        count: 4,
      },
      { kind: 'process', appId: 'codex', ts: Date.now(), lagP95Ms: 499 },
      // Above threshold: 3 alerts must fire
      { kind: 'exit', appId: 'armory', displayName: 'Armory', ts: Date.now(), exitKind: 'crash', exitCode: 1 },
      {
        kind: 'http',
        appId: 'armory',
        displayName: 'Armory',
        ts: Date.now(),
        method: 'POST',
        routePattern: '/api/builds',
        statusClass: '5xx',
        count: 5,
      },
      { kind: 'process', appId: 'armory', displayName: 'Armory', ts: Date.now(), lagP95Ms: 650 },
      // Duplicate crash within cooldown: suppressed
      { kind: 'exit', appId: 'armory', displayName: 'Armory', ts: Date.now(), exitKind: 'crash', exitCode: 1 },
    ]);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const bodies = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(String((init as RequestInit).body)).content as string,
    );
    expect(bodies[0]).toContain('Armory crashed');
    expect(bodies[1]).toContain('5xx burst on POST /api/builds');
    expect(bodies[2]).toContain('event-loop lag spike');
  });

  it('swallows webhook transport failures without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(() =>
      evaluateIngestAlerts([{ kind: 'exit', appId: 'codex', ts: Date.now(), exitKind: 'crash', exitCode: 137 }]),
    ).not.toThrow();
  });
});
