import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineAppVite } from '@dark-avian-labs/config/vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineAppVite({
  rootDir,
  defines: { VITE_APP_ID: 'armory' },
});
