import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { defineAppPlaywright } from '@dark-avian-labs/config/playwright';

const e2eRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-e2e-'));
const catalogDbPath = path.join(e2eRoot, 'warframe-catalog.db');
fs.writeFileSync(catalogDbPath, '');
const signedInRoot = process.env.E2E_CLERK_USER_EMAIL?.trim()
  ? fs.mkdtempSync(path.join(os.tmpdir(), 'codex-e2e-signed-in-'))
  : '';
const signedInCatalog = signedInRoot ? path.join(signedInRoot, 'warframe-catalog.db') : '';
if (signedInCatalog) fs.writeFileSync(signedInCatalog, '');

export default defineAppPlaywright({
  port: '3101',
  portEnv: 'CODEX_E2E_PORT',
  signedInPort: '4101',
  command: 'node scripts/e2e-server.mjs',
  timeout: 90_000,
  signedInTimeout: 180_000,
  env: {
    WARFRAME_CATALOG_DB_PATH: catalogDbPath,
    WARFRAME_DB_PATH: path.join(e2eRoot, 'warframe.db'),
    EPIC7_DB_PATH: path.join(e2eRoot, 'epic7.db'),
    WOR_DB_PATH: path.join(e2eRoot, 'wor.db'),
    WOR_CATALOG_DB_PATH: path.join(e2eRoot, 'wor-catalog.db'),
    BASE_DOMAIN: 'example.com',
    SECURE_COOKIES: '0',
  },
  signedInEnv: {
    WARFRAME_CATALOG_DB_PATH: signedInCatalog,
    WARFRAME_DB_PATH: path.join(signedInRoot || e2eRoot, 'warframe.db'),
    EPIC7_DB_PATH: path.join(signedInRoot || e2eRoot, 'epic7.db'),
    WOR_DB_PATH: path.join(signedInRoot || e2eRoot, 'wor.db'),
    WOR_CATALOG_DB_PATH: path.join(signedInRoot || e2eRoot, 'wor-catalog.db'),
    E2E_SERVER_ENTRY: 'scripts/e2e-server.mjs',
  },
});
