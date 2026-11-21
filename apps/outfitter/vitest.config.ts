import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defaultExclude, defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

const testEnv = {
  NODE_ENV: 'test',
  APP_PUBLIC_BASE_URL: 'http://127.0.0.1:3004',
  CLERK_PUBLISHABLE_KEY: '',
  CLERK_SECRET_KEY: '',
  VITE_CLERK_PUBLISHABLE_KEY: '',
} as const;

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(root, 'client'),
      '@shared': path.resolve(root, 'shared'),
    },
  },
  test: {
    environment: 'node',
    env: testEnv,
    include: [
      'server/**/*.test.ts',
      'client/**/*.test.ts',
      'shared/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    exclude: [...defaultExclude, 'dist/**', 'e2e/**'],
  },
});
