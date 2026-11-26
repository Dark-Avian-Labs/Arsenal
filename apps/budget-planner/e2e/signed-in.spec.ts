import { expect, test } from '@playwright/test';

test('created plan is still there after reload', async ({ page }) => {
  const name = 'E2E Household';
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Create plan' })).toBeVisible();
  await page.reload();
  await page.getByLabel('Plan name').fill(name);
  await expect(page.getByLabel('Plan name')).toHaveValue(name);
  await page.getByRole('button', { name: 'Create plan' }).click();
  await expect(page).toHaveURL(/\/plan\//);
  await page.goto('/');
  const plan = page.getByRole('link', { name });
  await expect(plan).toBeVisible();
  await page.reload();
  await expect(plan).toBeVisible();
});
