import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineAppVite } from '@dark-avian-labs/config/vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineAppVite({
  rootDir,
  devApiTarget: 'http://127.0.0.1:3004',
  devPort: 5174,
  proxyPaths: ['/api', '/hero-images'],
  watchIgnored: ['**/_resources/**', '**/data/**'],
  alias: { '@shared': 'shared' },
});
