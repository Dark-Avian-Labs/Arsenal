import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { defineAppVite } from './vite.ts';

describe('defineAppVite', () => {
  const originalCwd = process.cwd();
  let tmpDir: string | null = null;

  afterEach(() => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('strips encrypted: dotenvx values from Vite defines and respects env precedence', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dal-vite-config-'));
    fs.writeFileSync(
      path.join(tmpDir, '.env.production'),
      ['VITE_SECRET_LEAK=encrypted:abc123', 'VITE_FROM_FILE=file-val', 'VITE_OVERRIDDEN=from-file'].join('\n'),
    );
    process.chdir(tmpDir);

    vi.stubEnv('APP_VERSION', '2.3.4');
    vi.stubEnv('VITE_OVERRIDDEN', 'from-process');
    vi.stubEnv('VITE_ENC_PROCESS', 'encrypted:xyz');

    const factory = defineAppVite({
      rootDir: tmpDir,
      defines: {
        VITE_FROM_FILE: 'fallback-1',
        VITE_OVERRIDDEN: 'fallback-2',
        VITE_ENC_PROCESS: 'fallback-3',
      },
    });
    const config =
      typeof factory === 'function'
        ? factory({ mode: 'production', command: 'build', isSsrBuild: false, isPreview: false })
        : factory;

    expect(config.define).toMatchObject({
      'import.meta.env.VITE_APP_VERSION': '"2.3.4"',
      'import.meta.env.VITE_SECRET_LEAK': '""',
      'import.meta.env.VITE_FROM_FILE': '"file-val"',
      'import.meta.env.VITE_OVERRIDDEN': '"from-process"',
      'import.meta.env.VITE_ENC_PROCESS': '"fallback-3"',
    });
  });
});
