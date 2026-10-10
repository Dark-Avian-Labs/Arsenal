import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { defineAppPlaywright } from '@dark-avian-labs/config/playwright';

const e2eRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'budgetplanner-e2e-'));
const signedInRoot = process.env.E2E_CLERK_USER_EMAIL?.trim()
  ? fs.mkdtempSync(path.join(os.tmpdir(), 'budgetplanner-e2e-signed-in-'))
  : e2eRoot;

export default defineAppPlaywright({
  port: '3103',
  portEnv: 'BUDGETPLANNER_E2E_PORT',
  signedInPort: '4103',
  env: {
    APP_DB_PATH: path.join(e2eRoot, 'app.db'),
    COOKIE_DOMAIN: '',
    SECURE_COOKIES: '0',
  },
  signedInEnv: {
    APP_DB_PATH: path.join(signedInRoot, 'app.db'),
  },
});
