import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      SESSION_SECRET: 'appbase-dev-only-session-secret-32ch',
      APP_PUBLIC_BASE_URL: 'http://127.0.0.1:3000',
      CLERK_PUBLISHABLE_KEY: '',
      CLERK_SECRET_KEY: '',
      VITE_CLERK_PUBLISHABLE_KEY: '',
    },
    include: ['server/**/*.test.ts', 'client/**/*.test.ts'],
    exclude: ['dist/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      all: true,
      reporter: ['text-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['server/**/*.ts', 'client/utils/**/*.ts'],
      exclude: ['**/*.test.ts', 'dist/**', 'e2e/**', 'server/index.ts'],
    },
  },
});
