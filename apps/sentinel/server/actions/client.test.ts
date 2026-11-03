import { describe, expect, it } from 'vitest';

import { describeTransportError } from './client.ts';

describe('describeTransportError', () => {
  it('keeps the undici cause when fetch only says fetch failed', () => {
    const cause = new Error('Connect Timeout Error');
    cause.name = 'ConnectTimeoutError';
    Object.assign(cause, { code: 'UND_ERR_CONNECT_TIMEOUT' });
    const err = new TypeError('fetch failed', { cause });

    expect(describeTransportError(err)).toBe(
      'fetch failed ConnectTimeoutError Connect Timeout Error UND_ERR_CONNECT_TIMEOUT',
    );
  });
});
