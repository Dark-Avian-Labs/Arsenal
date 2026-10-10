import path from 'node:path';

import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

import { clerkFrontendApiOrigin, readSignedInClerk, signedInStorageState } from './e2e.ts';

export interface AppPlaywrightOptions {
  port: string;
  portEnv?: string;
  signedInPort?: string;
  command?: string;
  timeout?: number;
  signedInTimeout?: number;
  env?: Record<string, string>;
  signedInEnv?: Record<string, string>;
}

export function defineAppPlaywright(options: AppPlaywrightOptions): PlaywrightTestConfig {
  const port = (options.portEnv ? process.env[options.portEnv]?.trim() : '') || options.port;
  const baseURL = `http://127.0.0.1:${port}`;
  const clerk = options.signedInPort ? readSignedInClerk() : null;
  const signedInURL = options.signedInPort ? `http://127.0.0.1:${options.signedInPort}` : '';
  const browser = { ...devices['Desktop Chrome'], locale: 'en-US' as const };

  const signedOutServer = {
    command: options.command ?? 'node server/index.ts',
    url: `${baseURL}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: options.timeout ?? 30_000,
    env: {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: port,
      APP_PUBLIC_BASE_URL: baseURL,
      CLERK_PUBLISHABLE_KEY: '',
      CLERK_SECRET_KEY: '',
      VITE_CLERK_PUBLISHABLE_KEY: '',
      ...options.env,
    },
  };

  return defineConfig({
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
    webServer:
      clerk && options.signedInPort
        ? [
            signedOutServer,
            {
              command: 'node ../../scripts/e2e-signed-in.mjs',
              url: `${signedInURL}/healthz`,
              reuseExistingServer: false,
              timeout: options.signedInTimeout ?? 120_000,
              env: {
                ...signedOutServer.env,
                PORT: options.signedInPort,
                APP_PUBLIC_BASE_URL: signedInURL,
                ...options.signedInEnv,
                CLERK_PUBLISHABLE_KEY: clerk.publishable,
                CLERK_SECRET_KEY: clerk.secret,
                VITE_CLERK_PUBLISHABLE_KEY: clerk.publishable,
                CLERK_FAPI_URL: clerkFrontendApiOrigin(clerk.publishable),
                E2E_CLIENT_DIR: path.resolve('dist/e2e-client'),
              },
            },
          ]
        : signedOutServer,
    projects: [
      {
        name: 'chromium',
        ...(options.signedInPort ? { testIgnore: /signed-in\.spec\.ts|auth\.setup\.ts/ } : {}),
        use: browser,
      },
      ...(clerk && options.signedInPort
        ? [
            {
              name: 'clerk-setup',
              testMatch: /auth\.setup\.ts/,
              use: { ...browser, baseURL: signedInURL },
            },
            {
              name: 'signed-in',
              testMatch: /signed-in\.spec\.ts/,
              dependencies: ['clerk-setup'],
              use: { ...browser, baseURL: signedInURL, storageState: signedInStorageState },
            },
          ]
        : []),
    ],
  });
}
