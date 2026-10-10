import { expectSignedInShell } from '@dark-avian-labs/config/e2e';
import { test } from '@playwright/test';

test('signed-in shell shows logout', async ({ page }) => {
  await expectSignedInShell(page);
});
