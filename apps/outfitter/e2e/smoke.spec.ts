import { expect, test } from '@playwright/test';

test('readiness probe reaches all sqlite files', async ({ request }) => {
  const res = await request.get('/readyz');
  expect(res.status()).toBe(200);
  await expect(res.json()).resolves.toMatchObject({ status: 'ready', app: 'Outfitter' });
});

test('SPA boots in the browser without runtime errors', async ({ page }) => {
  const errors: Error[] = [];
  page.on('pageerror', (err) => errors.push(err));
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('#root')).not.toBeEmpty();
  expect(errors).toEqual([]);
});
