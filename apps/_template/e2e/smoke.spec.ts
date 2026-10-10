import { expect, test } from '@playwright/test';

test('liveness probe is up', async ({ request }) => {
  const res = await request.get('/healthz');
  expect(res.status()).toBe(200);
  await expect(res.json()).resolves.toMatchObject({ status: 'ok', app: 'AppBase' });
});

test('readiness probe is up', async ({ request }) => {
  const res = await request.get('/readyz');
  expect(res.status()).toBe(200);
  await expect(res.json()).resolves.toMatchObject({ status: 'ready', app: 'AppBase' });
});

test('version endpoint is uncached', async ({ request }) => {
  const res = await request.get('/api/version');
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toBe('no-store');
  const body = (await res.json()) as { version: string };
  expect(body.version.length).toBeGreaterThan(0);
});

test('cross-site writes are rejected', async ({ request }) => {
  const res = await request.post('/api/anything', {
    data: {},
    headers: { 'Sec-Fetch-Site': 'cross-site' },
  });
  expect(res.status()).toBe(403);
  await expect(res.json()).resolves.toMatchObject({ error: 'Cross-site request rejected' });
});

test('unknown API routes return JSON 404', async ({ request }) => {
  const res = await request.get('/api/nope');
  expect(res.status()).toBe(404);
  await expect(res.json()).resolves.toMatchObject({ error: 'Not found' });
});

test('SPA is served when the client build exists', async ({ request }) => {
  const res = await request.get('/');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/html/);
});
