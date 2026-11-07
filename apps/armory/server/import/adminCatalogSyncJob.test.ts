import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { isAdminCatalogSyncRunning, startAdminCatalogSyncJob } from './adminCatalogSyncJob.ts';

const { fork } = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock('node:child_process', () => ({ fork }));

function fakeChild() {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  });
}

describe('adminCatalogSyncJob', () => {
  it('starts a second run after the first one finishes', () => {
    const first = fakeChild();
    fork.mockReturnValueOnce(first);
    expect(startAdminCatalogSyncJob('user_a').started).toBe(true);
    expect(startAdminCatalogSyncJob('user_a').started).toBe(false);

    first.emit('message', { tables: { mods: 3 }, imagesCopied: 0, imagesSkipped: 0 });
    first.emit('close', 0, null);
    expect(isAdminCatalogSyncRunning()).toBe(false);

    fork.mockReturnValueOnce(fakeChild());
    const second = startAdminCatalogSyncJob('user_a');
    expect(second.started).toBe(true);
    expect(second.snapshot.runId).toBe(2);
  });
});
