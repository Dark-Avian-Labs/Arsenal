import { expectSignedInShell } from '@dark-avian-labs/config/e2e';
import { expect, test } from '@playwright/test';

test('signed-in shell shows logout', async ({ page }) => {
  await expectSignedInShell(page);
});

test('created account is still there after reload', async ({ page }) => {
  const name = 'E2E Main';
  await page.goto('/');
  await page.getByRole('button', { name: 'Accounts' }).click();
  await page.getByRole('button', { name: 'Add account' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('button', { name })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name })).toBeVisible();
});
