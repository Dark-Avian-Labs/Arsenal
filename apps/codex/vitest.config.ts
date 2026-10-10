import os from 'node:os';
import path from 'node:path';

import { defineConfig } from 'vitest/config';

const testEnvDefaults = {
  NODE_ENV: 'test',
  WARFRAME_CATALOG_DB_PATH: path.join(os.tmpdir(), 'codex-vitest-warframe-catalog.db'),
  WOR_CATALOG_DB_PATH: path.join(os.tmpdir(), 'codex-vitest-wor-catalog.db'),
  COOKIE_DOMAIN: 'localhost',
  BASE_DOMAIN: 'example.com',
  CLERK_PUBLISHABLE_KEY: '',
  CLERK_SECRET_KEY: '',
  VITE_CLERK_PUBLISHABLE_KEY: '',
} as const;

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['server/testing/globalSetup.sqlite.ts'],
    include: ['server/**/*.test.ts', 'client/**/*.test.ts', 'scripts/**/*.test.ts'],
    testTimeout: 10_000,
    env: {
      ...testEnvDefaults,
    },
  },
});
