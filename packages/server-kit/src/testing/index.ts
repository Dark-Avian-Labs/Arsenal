import http from 'node:http';

import type { Express } from 'express';

export { clerkFrontendApiOrigin, isSignedInClerkConfigured } from './signedInClerk.js';
export { mockResponse } from './mockResponse.js';

export async function withServer<T>(app: Express, fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
