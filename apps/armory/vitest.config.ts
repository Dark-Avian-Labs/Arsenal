import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defaultExclude, defineConfig } from 'vitest/config';

const testEnv = {
  NODE_ENV: 'test',
  APP_PUBLIC_BASE_URL: 'http://127.0.0.1:3002',
  CLERK_PUBLISHABLE_KEY: '',
  CLERK_SECRET_KEY: '',
  VITE_CLERK_PUBLISHABLE_KEY: '',
} as const;

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          env: testEnv,
          exclude: [...defaultExclude, 'dist/**', 'e2e/**'],
          include: [
            'server/**/*.test.ts',
            'client/**/*.test.ts',
            'shared/**/*.test.ts',
            'scripts/**/*.test.ts',
          ],
        },
      },
      {
        plugins: [react()],
        resolve: {
          alias: {
            '@': path.resolve(import.meta.dirname, 'client'),
          },
        },
        test: {
          name: 'dom',
          environment: 'happy-dom',
          env: testEnv,
          include: ['client/**/*.test.tsx'],
        },
      },
    ],
  },
});
