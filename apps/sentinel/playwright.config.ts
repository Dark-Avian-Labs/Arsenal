import { defineConfig, devices } from '@playwright/test';

const port = '3105';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node server/index.ts',
    url: `${baseURL}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: port,
      APP_PUBLIC_BASE_URL: baseURL,
      CLERK_PUBLISHABLE_KEY: '',
      CLERK_SECRET_KEY: '',
      VITE_CLERK_PUBLISHABLE_KEY: '',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
