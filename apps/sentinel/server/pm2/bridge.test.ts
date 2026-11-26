import { describe, expect, it } from 'vitest';

import { classifyPm2Restart } from './bridge.ts';

describe('classifyPm2Restart', () => {
  it('marks non-zero exit codes as crash even when PM2 already autorestarted to online', () => {
    expect(
      classifyPm2Restart({
        status: 'online',
        exitCode: 1,
        prevUnstableRestarts: 0,
        unstableRestarts: 0,
      }),
    ).toBe('crash');
  });

  it('marks increasing unstable_restarts as crash even if exitCode is missing', () => {
    expect(
      classifyPm2Restart({
        status: 'online',
        exitCode: undefined,
        prevUnstableRestarts: 0,
        unstableRestarts: 1,
      }),
    ).toBe('crash');
  });

  it('marks errored status as crash', () => {
    expect(
      classifyPm2Restart({
        status: 'errored',
        exitCode: 0,
        prevUnstableRestarts: 0,
        unstableRestarts: 0,
      }),
    ).toBe('crash');
  });

  it('marks clean online restarts with exitCode 0 as graceful', () => {
    expect(
      classifyPm2Restart({
        status: 'online',
        exitCode: 0,
        prevUnstableRestarts: 1,
        unstableRestarts: 1,
      }),
    ).toBe('graceful');
  });
});
