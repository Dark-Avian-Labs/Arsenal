import { test } from '@playwright/test';

import { expectSignedInShell } from './signedInShell.js';

test('signed-in shell shows logout', async ({ page }) => {
  await expectSignedInShell(page);
});
