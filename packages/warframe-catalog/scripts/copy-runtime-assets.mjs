import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
mkdirSync(path.join(root, 'dist'), { recursive: true });
copyFileSync(
  path.join(root, 'src/beast-claw-registry.json'),
  path.join(root, 'dist/beast-claw-registry.json'),
);
