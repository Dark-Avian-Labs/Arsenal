import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { defineAppPlaywright } from '@dark-avian-labs/config/playwright';

const e2eRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armory-e2e-'));
const signedInRoot = process.env.E2E_CLERK_USER_EMAIL?.trim()
  ? fs.mkdtempSync(path.join(os.tmpdir(), 'armory-e2e-signed-in-'))
  : e2eRoot;

export default defineAppPlaywright({
  port: '3102',
  portEnv: 'ARMORY_E2E_PORT',
  signedInPort: '4102',
  env: {
    ARMORY_DB_PATH: path.join(e2eRoot, 'catalog.db'),
    USER_DB_PATH: path.join(e2eRoot, 'user.db'),
    COOKIE_DOMAIN: '',
    SECURE_COOKIES: '0',
  },
  signedInEnv: {
    ARMORY_DB_PATH: path.join(signedInRoot, 'catalog.db'),
    USER_DB_PATH: path.join(signedInRoot, 'user.db'),
  },
});
