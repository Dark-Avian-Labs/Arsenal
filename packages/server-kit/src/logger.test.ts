import { afterEach, describe, expect, it, vi } from 'vitest';

import { log } from './logger.ts';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes JSON lines with ISO ts and routes levels to the matching console method', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    log('info', 'hello', { key: 'value' });
    log('debug', 'trace');
    log('warn', 'careful');
    log('error', 'boom');

    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledOnce();

    const info = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(info.level).toBe('info');
    expect(info.msg).toBe('hello');
    expect(info.key).toBe('value');
    expect(info.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(JSON.parse(String(logSpy.mock.calls[1]?.[0]))).toMatchObject({ level: 'debug', msg: 'trace' });
    expect(JSON.parse(String(warnSpy.mock.calls[0]?.[0]))).toMatchObject({ level: 'warn', msg: 'careful' });
    expect(JSON.parse(String(errorSpy.mock.calls[0]?.[0]))).toMatchObject({ level: 'error', msg: 'boom' });
  });

  it('does not let caller fields override ts, level, or msg', () => {
    const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    log('info', 'real message', {
      ts: 'spoofed-ts',
      level: 'error',
      msg: 'spoofed-msg',
      requestId: 'abc',
    });

    const line = JSON.parse(String(infoSpy.mock.calls[0]?.[0])) as {
      ts: string;
      level: string;
      msg: string;
      requestId: string;
    };
    expect(line.msg).toBe('real message');
    expect(line.level).toBe('info');
    expect(line.ts).not.toBe('spoofed-ts');
    expect(line.requestId).toBe('abc');
  });
});
