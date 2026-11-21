import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The repo root has no dependency on server-kit (pnpm only links it into the apps), so import the
// workspace package's built dist directly (built by the root postinstall). Same module instance
// the Codex import code loads through apps/codex/node_modules.
import { SqliteDatabase } from '../../packages/server-kit/dist/index.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CODEX_ROOT = path.join(REPO_ROOT, 'apps', 'codex');

type TargetGame = 'all' | 'warframe' | 'wor';

function parseArgs(argv: string[]): {
  game: TargetGame;
  outDir: string;
  workDir: string | null;
  force: boolean;
  forceImages: boolean;
} {
  let game: TargetGame = 'all';
  let outDir = path.join(REPO_ROOT, '.catalog-stage');
  let workDir: string | null = null;
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
    } else if (arg.startsWith('--work-dir=')) {
      workDir = path.resolve(arg.slice('--work-dir='.length));
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--force-images') {
      forceImages = true;
    }
  }
  return { game, outDir, workDir, force, forceImages };
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

function computeTableContentHash(dbPath: string, tables: readonly string[]): string {
  const hash = createHash('sha256');
  const db = new SqliteDatabase(dbPath, { readonly: true, fileMustExist: true });
  try {
    for (const table of tables) {
      const exists = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table);
      if (!exists) continue;
      const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
        (c) => c.name,
      );
      const orderBy =
        cols.length > 0
          ? `ORDER BY ${cols.map((c) => `"${c.replaceAll('"', '""')}"`).join(', ')}`
          : '';
      const rows = db.prepare(`SELECT * FROM ${table} ${orderBy}`).all();
      hash.update(`${table}\n`);
      hash.update(JSON.stringify(rows, (_key, v) => (typeof v === 'bigint' ? v.toString() : v)));
      hash.update('\n');
    }
  } finally {
    db.close();
  }
  return hash.digest('hex');
}

function copyTreeAndHash(fromDir: string, toDir: string): { count: number; sha256: string } {
  const hash = createHash('sha256');
  if (!fs.existsSync(fromDir)) return { count: 0, sha256: hash.digest('hex') };
  const files: string[] = [];
  const collect = (dir: string, relBase: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collect(full, rel);
      } else if (entry.isFile() && !entry.name.endsWith('.hash')) {
        files.push(rel);
      }
    }
  };
  collect(fromDir, '');
  files.sort();
  for (const rel of files) {
    const srcPath = path.join(fromDir, rel);
    const dstPath = path.join(toDir, rel);
    fs.mkdirSync(path.dirname(dstPath), { recursive: true });
    const bytes = fs.readFileSync(srcPath);
    fs.writeFileSync(dstPath, bytes);
    hash.update(rel);
    hash.update('\0');
    hash.update(bytes);
    hash.update('\0');
  }
  return { count: files.length, sha256: hash.digest('hex') };
}

async function main(): Promise<void> {
  const {
    game,
    outDir,
    workDir: explicitWorkDir,
    force,
    forceImages,
  } = parseArgs(process.argv.slice(2));
  const persistentWorkDir = explicitWorkDir !== null;
  const workDir = explicitWorkDir ?? path.join(outDir, '_work');
  const stageDir = path.join(outDir, 'payload');

  // Always start with a clean payload directory, but preserve persistent --work-dir across runs
  // so unchanged exports/images are skipped unless --force / --force-images is passed.
  fs.rmSync(stageDir, { recursive: true, force: true });
  if (!persistentWorkDir) {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(stageDir, { recursive: true });

  // Skip dotenvx decryption in CI (no production secrets needed for public catalog scraping)
  // and isolate all Codex paths inside workDir so DATA_DIR containment validation holds.
  process.env.ARSENAL_SKIP_LOAD_ENV = '1';
  process.env.BASE_DOMAIN = process.env.BASE_DOMAIN?.trim() || 'darkavianlabs.com';
  process.env.DATA_DIR = workDir;
  process.env.WARFRAME_DB_PATH = path.join(workDir, 'warframe.db');
  process.env.WARFRAME_CATALOG_DB_PATH = path.join(workDir, 'warframe-catalog.db');
  process.env.EPIC7_DB_PATH = path.join(workDir, 'epic7.db');
  process.env.WOR_DB_PATH = path.join(workDir, 'wor.db');
  process.env.WOR_CATALOG_DB_PATH = path.join(workDir, 'wor-catalog.db');
  process.env.WARFRAME_IMAGES_DIR = path.join(workDir, 'images', 'warframe');
  process.env.WOR_IMAGES_DIR = path.join(workDir, 'images', 'wor');
  process.env.WOR_IMPORT_LIVE = process.env.WOR_IMPORT_LIVE ?? '1';
  // The wiki scrapers refuse to run without a descriptive User-Agent (wiki.warframe.com / Fandom
  // policy). Production Codex had one in its encrypted env; the CI builder has no env file.
  process.env.WIKI_USER_AGENT =
    process.env.WIKI_USER_AGENT?.trim() ||
    'DarkAvianLabs-Arsenal-CatalogSync/1.0 (+https://codex.darkavianlabs.com)';
  process.chdir(CODEX_ROOT);

  const { ensureDataDirs } = await import('../../apps/codex/server/config.ts');
  ensureDataDirs();

  const manifest: {
    builtAt: string;
    sha: string;
    games: string[];
    databases: Record<string, { sizeBytes: number; sha256: string; contentHash: string }>;
    images: Record<string, number>;
    imageHashes: Record<string, string>;
  } = {
    builtAt: new Date().toISOString(),
    sha: process.env.GITHUB_SHA ?? 'local',
    games: [],
    databases: {},
    images: {},
    imageHashes: {},
  };

  if (game === 'all' || game === 'warframe') {
    console.log('[catalog-builder] Building Warframe catalog...');
    const { runStartupPipeline } =
      await import('../../apps/codex/server/import/warframe/startupPipeline.ts');
    const { closeCatalogDb } =
      await import('../../apps/codex/server/import/warframe/db/connection.ts');
    const summary = await runStartupPipeline({
      forceImport: force,
      forceImages,
      cliReport: true,
    });
    closeCatalogDb();
    if (summary.blockingIssues.length > 0) {
      throw new Error(
        `Warframe catalog pipeline reported blocking issue(s): ${summary.blockingIssues.join('; ')}`,
      );
    }
    const dest = path.join(stageDir, 'warframe-catalog.db');
    vacuumCopy(process.env.WARFRAME_CATALOG_DB_PATH, dest);
    const contentHash = computeTableContentHash(dest, [
      'warframes',
      'weapons',
      'companions',
      'mods',
      'mod_sets',
      'arcanes',
      'abilities',
      'archon_shard_types',
      'archon_shard_buffs',
      'warframe_market_links',
      'codex_modular_weapons',
    ]);
    manifest.games.push('warframe');
    manifest.databases['warframe-catalog.db'] = {
      sizeBytes: fs.statSync(dest).size,
      sha256: sha256File(dest),
      contentHash,
    };
    const wfImages = copyTreeAndHash(
      process.env.WARFRAME_IMAGES_DIR,
      path.join(stageDir, 'images', 'warframe'),
    );
    manifest.images.warframe = wfImages.count;
    manifest.imageHashes.warframe = wfImages.sha256;
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

    const worHashFile = path.join(workDir, '.wor-content.sha256');
    const previousWorHash = fs.existsSync(worHashFile)
      ? fs.readFileSync(worHashFile, 'utf8').trim()
      : '';
    const contentHash = computeTableContentHash(process.env.WOR_CATALOG_DB_PATH, [
      'catalog_heroes',
      'catalog_artifacts',
      'catalog_demons',
    ]);

    // Only advance catalog_version when WoR catalog content actually changed (or --force was set),
    // preventing daily no-op swaps and restarts when upstream data is unchanged.
    if (force || contentHash !== previousWorHash) {
      const snapshotVersion = Math.floor(Date.now() / 1000);
      const worMetaDb = new SqliteDatabase(process.env.WOR_CATALOG_DB_PATH, {
        fileMustExist: true,
      });
      try {
        worMetaDb
          .prepare(
            'UPDATE catalog_meta SET catalog_version = MAX(catalog_version + 1, ?) WHERE id = 1',
          )
          .run(snapshotVersion);
      } finally {
        worMetaDb.close();
      }
      fs.writeFileSync(worHashFile, `${contentHash}\n`, 'utf8');
    }

    const dest = path.join(stageDir, 'wor-catalog.db');
    vacuumCopy(process.env.WOR_CATALOG_DB_PATH, dest);
    manifest.games.push('wor');
    manifest.databases['wor-catalog.db'] = {
      sizeBytes: fs.statSync(dest).size,
      sha256: sha256File(dest),
      contentHash,
    };
    const worImages = copyTreeAndHash(
      process.env.WOR_IMAGES_DIR,
      path.join(stageDir, 'images', 'wor'),
    );
    manifest.images.wor = worImages.count;
    manifest.imageHashes.wor = worImages.sha256;
    console.log(
      `[catalog-builder] WoR ready: ${manifest.databases['wor-catalog.db'].sizeBytes} bytes, ${manifest.images.wor} images.`,
    );
  }

  fs.writeFileSync(
    path.join(stageDir, 'catalog-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  if (!persistentWorkDir) {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  console.log(`[catalog-builder] Staged catalog payload at ${stageDir}`);
}

main().catch((error: unknown) => {
  console.error('[catalog-builder] Failed:', error);
  process.exitCode = 1;
});
