import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  loadAppEnv,
  parseBooleanEnv,
  parseIntEnv,
  readPackageVersion,
  readReleaseVersion,
  readServerEnv,
} from './loadEnv.ts';

describe('loadEnv', () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    vi.unstubAllEnvs();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('forces caller appName/appId when ARSENAL_UNIFIED_HOST=1 so sub-apps never inherit host IDs', () => {
    vi.stubEnv('ARSENAL_UNIFIED_HOST', '1');
    vi.stubEnv('APP_ID', 'arsenal');
    vi.stubEnv('APP_NAME', 'Arsenal');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SECURE_COOKIES', '');

    const env = readServerEnv({ port: 3002, appName: 'Armory', appId: 'armory' });
    expect(env.APP_ID).toBe('armory');
    expect(env.APP_NAME).toBe('Armory');
    expect(env.SECURE_COOKIES).toBe(true);
  });

  it('allows APP_ID/APP_NAME env overrides outside unified host', () => {
    vi.stubEnv('ARSENAL_UNIFIED_HOST', '');
    vi.stubEnv('APP_ID', 'custom-id');
    vi.stubEnv('APP_NAME', 'Custom');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SECURE_COOKIES', '');

    const env = readServerEnv({ port: 3002, appName: 'Armory', appId: 'armory' });
    expect(env.APP_ID).toBe('custom-id');
    expect(env.APP_NAME).toBe('Custom');
    expect(env.SECURE_COOKIES).toBe(false);
  });

  it('skips reading env files when ARSENAL_SKIP_LOAD_ENV=1 even if .env.production is absent', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-env-skip-'));
    vi.stubEnv('ARSENAL_SKIP_LOAD_ENV', '1');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLERK_PUBLISHABLE_KEY', '');
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '');
    vi.stubEnv('CLERK_SECRET_KEY', '');

    expect(() => loadAppEnv(tmpDir!, { requireClerkKeys: false })).not.toThrow();
  });

  it('fails closed in production when .env.production is missing or NODE_ENV is unsupported', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-env-fail-'));
    vi.stubEnv('ARSENAL_SKIP_LOAD_ENV', '');

    vi.stubEnv('NODE_ENV', 'production');
    expect(() => loadAppEnv(tmpDir!, { requireClerkKeys: false })).toThrow(/Missing \.env\.production/);

    vi.stubEnv('NODE_ENV', 'staging');
    expect(() => loadAppEnv(tmpDir!, { requireClerkKeys: false })).toThrow(/Unsupported NODE_ENV/);
  });

  it('parses booleans, positive ints, package version, and release version precedence', () => {
    expect(parseBooleanEnv('true')).toBe(true);
    expect(parseBooleanEnv('1')).toBe(true);
    expect(parseBooleanEnv('false')).toBe(false);
    expect(parseBooleanEnv('0')).toBe(false);
    expect(parseBooleanEnv('yes')).toBeUndefined();

    expect(parseIntEnv('4000', 3000)).toBe(4000);
    expect(parseIntEnv('0', 3000)).toBe(3000);
    expect(parseIntEnv('abc', 3000)).toBe(3000);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-env-ver-'));
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
    fs.writeFileSync(path.join(tmpDir, 'release.json'), JSON.stringify({ version: '1.2.4' }));

    expect(readPackageVersion(tmpDir)).toBe('1.2.3');
    vi.stubEnv('APP_VERSION', '');
    expect(readReleaseVersion(tmpDir)).toBe('1.2.4');
    vi.stubEnv('APP_VERSION', '9.9.9');
    expect(readReleaseVersion(tmpDir)).toBe('9.9.9');
  });
});
