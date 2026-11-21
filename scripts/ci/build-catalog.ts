import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SqliteDatabase } from '@dark-avian-labs/server-kit';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CODEX_ROOT = path.join(REPO_ROOT, 'apps', 'codex');

type TargetGame = 'all' | 'warframe' | 'wor';

function parseArgs(argv: string[]): {
  game: TargetGame;
  outDir: string;
  force: boolean;
  forceImages: boolean;
} {
  let game: TargetGame = 'all';
  let outDir = path.join(REPO_ROOT, '.catalog-stage');
  let force = false;
  let forceImages = false;

  for (const arg of argv) {
    if (arg.startsWith('--game=')) {
      const value = arg.slice('--game='.length).trim().toLowerCase();
      if (value === 'all' || value === 'warframe' || value === 'wor') {
        game = value;
      } else {
        throw new Error(`Invalid --game value "${value}". Expected all, warframe, or wor.`);
      }
    } else if (arg.startsWith('--out=')) {
      outDir = path.resolve(arg.slice('--out='.length));
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--force-images') {
      forceImages = true;
    }
  }
  return { game, outDir, force, forceImages };
}

function vacuumCopy(sourceDbPath: string, destDbPath: string): void {
  fs.mkdirSync(path.dirname(destDbPath), { recursive: true });
  if (fs.existsSync(destDbPath)) fs.rmSync(destDbPath, { force: true });
  const sqlDest = destDbPath.replaceAll('\\', '/').replaceAll("'", "''");
  const db = new SqliteDatabase(sourceDbPath, { readonly: true, fileMustExist: true });
  try {
    db.exec(`VACUUM INTO '${sqlDest}'`);
  } finally {
    db.close();
  }
}

function sha256File(filePath: string): string {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function copyTreeIfPresent(fromDir: string, toDir: string): number {
  if (!fs.existsSync(fromDir)) return 0;
  let count = 0;
  const walk = (src: string, dst: string) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const dstPath = path.join(dst, entry.name);
      if (entry.isDirectory()) {
        walk(srcPath, dstPath);
      } else if (entry.isFile() && !entry.name.endsWith('.hash')) {
        fs.copyFileSync(srcPath, dstPath);
        count += 1;
      }
    }
  };
  walk(fromDir, toDir);
  return count;
}

async function main(): Promise<void> {
  const { game, outDir, force, forceImages } = parseArgs(process.argv.slice(2));
  const workDir = path.join(outDir, '_work');
  const stageDir = path.join(outDir, 'payload');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(stageDir, { recursive: true });

  // Point Codex config paths at an isolated staging workspace so we never touch developer data/.
  process.env.WARFRAME_DB_PATH = path.join(workDir, 'warframe.db');
  process.env.WARFRAME_CATALOG_DB_PATH = path.join(workDir, 'warframe-catalog.db');
  process.env.EPIC7_DB_PATH = path.join(workDir, 'epic7.db');
  process.env.WOR_DB_PATH = path.join(workDir, 'wor.db');
  process.env.WOR_CATALOG_DB_PATH = path.join(workDir, 'wor-catalog.db');
  process.env.WARFRAME_IMAGES_DIR = path.join(workDir, 'images', 'warframe');
  process.env.WOR_IMAGES_DIR = path.join(workDir, 'images', 'wor');
  process.env.WOR_IMPORT_LIVE = process.env.WOR_IMPORT_LIVE ?? '1';
  process.chdir(CODEX_ROOT);

  const { ensureDataDirs } = await import('../../apps/codex/server/config.ts');
  ensureDataDirs();

  const manifest: {
    builtAt: string;
    sha: string;
    games: string[];
    databases: Record<string, { sizeBytes: number; sha256: string }>;
    images: Record<string, number>;
  } = {
    builtAt: new Date().toISOString(),
    sha: process.env.GITHUB_SHA ?? 'local',
    games: [],
    databases: {},
    images: {},
  };

  if (game === 'all' || game === 'warframe') {
    console.log('[catalog-builder] Building Warframe catalog...');
    const { runStartupPipeline } =
      await import('../../apps/codex/server/import/warframe/startupPipeline.ts');
    const { closeCatalogDb } =
      await import('../../apps/codex/server/import/warframe/db/connection.ts');
    await runStartupPipeline({
      forceImport: force,
      forceImages,
      cliReport: true,
    });
    closeCatalogDb();
    const dest = path.join(stageDir, 'warframe-catalog.db');
    vacuumCopy(process.env.WARFRAME_CATALOG_DB_PATH, dest);
    manifest.games.push('warframe');
    manifest.databases['warframe-catalog.db'] = {
      sizeBytes: fs.statSync(dest).size,
      sha256: sha256File(dest),
    };
    manifest.images.warframe = copyTreeIfPresent(
      process.env.WARFRAME_IMAGES_DIR,
      path.join(stageDir, 'images', 'warframe'),
    );
    console.log(
      `[catalog-builder] Warframe ready: ${manifest.databases['warframe-catalog.db'].sizeBytes} bytes, ${manifest.images.warframe} images.`,
    );
  }

  if (game === 'all' || game === 'wor') {
    console.log('[catalog-builder] Building Watcher of Realms catalog...');
    const { runWorStartupPipeline } =
      await import('../../apps/codex/server/import/wor/startupPipeline.ts');
    const { closeWorCatalogDb, closeWorDb } =
      await import('../../apps/codex/server/games/wor/index.ts');
    await runWorStartupPipeline({
      forceImport: force,
      forceImages,
    });
    closeWorCatalogDb();
    closeWorDb();
    const dest = path.join(stageDir, 'wor-catalog.db');
    vacuumCopy(process.env.WOR_CATALOG_DB_PATH, dest);
    manifest.games.push('wor');
    manifest.databases['wor-catalog.db'] = {
      sizeBytes: fs.statSync(dest).size,
      sha256: sha256File(dest),
    };
    manifest.images.wor = copyTreeIfPresent(
      process.env.WOR_IMAGES_DIR,
      path.join(stageDir, 'images', 'wor'),
    );
    console.log(
      `[catalog-builder] WoR ready: ${manifest.databases['wor-catalog.db'].sizeBytes} bytes, ${manifest.images.wor} images.`,
    );
  }

  fs.writeFileSync(
    path.join(stageDir, 'catalog-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  fs.rmSync(workDir, { recursive: true, force: true });
  console.log(`[catalog-builder] Staged catalog payload at ${stageDir}`);
}

main().catch((error: unknown) => {
  console.error('[catalog-builder] Failed:', error);
  process.exitCode = 1;
});
