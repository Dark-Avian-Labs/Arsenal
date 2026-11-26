import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SqliteDatabase } from '@dark-avian-labs/server-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createCodexWorDb(
  dbPath: string,
  heroes: Array<{ slug: string; name: string; portrait_path: string | null; base_hp: number }>,
): void {
  const db = new SqliteDatabase(dbPath);
  db.exec(`
    CREATE TABLE catalog_heroes (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      class TEXT NOT NULL,
      faction TEXT NOT NULL,
      rarity TEXT NOT NULL,
      star_rating INTEGER NOT NULL,
      is_lord INTEGER NOT NULL DEFAULT 0,
      portrait_path TEXT,
      base_hp INTEGER,
      base_atk INTEGER,
      base_def INTEGER,
      display_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE catalog_artifacts (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      class TEXT,
      rarity TEXT NOT NULL,
      star_rating INTEGER NOT NULL,
      exclusive_hero_slug TEXT,
      is_universal INTEGER NOT NULL DEFAULT 1,
      portrait_path TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
  `);
  for (const hero of heroes) {
    db.prepare(
      `INSERT INTO catalog_heroes (slug, name, class, faction, rarity, star_rating, portrait_path, base_hp, base_atk, base_def)
       VALUES (?, ?, 'marksman', 'piercers', 'legendary', 5, ?, ?, 3000, 700)`,
    ).run(hero.slug, hero.name, hero.portrait_path, hero.base_hp);
  }
  db.prepare(
    `INSERT INTO catalog_artifacts (slug, name, class, rarity, star_rating)
     VALUES ('scarab', 'Golden Scarab', 'marksman', 'mythic', 5)`,
  ).run();
  db.close();
}

describe('initOutfitter & Codex WoR catalog sync', () => {
  let tmpDir: string;
  let closeOutfitter: (() => void) | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outfitter-init-'));
  });

  afterEach(() => {
    closeOutfitter?.();
    closeOutfitter = undefined;
    vi.unstubAllEnvs();
    vi.resetModules();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('imports Codex catalog, blocks portrait path traversal, preserves portraits on COALESCE, and re-syncs when source changes', async () => {
    const appDbPath = path.join(tmpDir, 'outfitter.db');
    const codexDbPath = path.join(tmpDir, 'codex-wor.db');
    const codexImagesDir = path.join(tmpDir, 'codex-images');
    const heroImagesDir = path.join(tmpDir, 'hero-images');

    fs.mkdirSync(path.join(codexImagesDir, 'heroes'), { recursive: true });
    fs.writeFileSync(path.join(codexImagesDir, 'heroes', 'silas.webp'), 'fake-webp');
    fs.writeFileSync(path.join(tmpDir, 'secret.txt'), 'do-not-copy');

    createCodexWorDb(codexDbPath, [
      { slug: 'silas', name: 'Silas', portrait_path: '/wor-images/heroes/silas.webp', base_hp: 10000 },
      { slug: 'evil', name: 'Evil', portrait_path: '/wor-images/../../secret.txt', base_hp: 9000 },
    ]);

    vi.stubEnv('APP_DB_PATH', appDbPath);
    vi.stubEnv('CODEX_WOR_DB_PATH', codexDbPath);
    vi.stubEnv('CODEX_WOR_IMAGES_DIR', codexImagesDir);
    vi.stubEnv('HERO_IMAGES_DIR', heroImagesDir);
    vi.resetModules();

    const { initOutfitter, closeOutfitter: close } = await import('./init.ts');
    const { getAppDb } = await import('./db/appDb.ts');
    closeOutfitter = close;

    initOutfitter();

    const db = getAppDb();
    const silas = db.prepare(`SELECT portrait_path, base_hp FROM catalog_heroes WHERE slug = 'silas'`).get() as {
      portrait_path: string | null;
      base_hp: number;
    };
    const evil = db.prepare(`SELECT portrait_path FROM catalog_heroes WHERE slug = 'evil'`).get() as {
      portrait_path: string | null;
    };
    expect(silas).toEqual({ portrait_path: '/hero-images/heroes/silas.webp', base_hp: 10000 });
    expect(evil.portrait_path).toBeNull();
    expect(fs.existsSync(path.join(heroImagesDir, 'heroes', 'silas.webp'))).toBe(true);

    // Update source DB: Silas portrait becomes null and HP increases -> SHA changes -> re-imports while COALESCE keeps portrait!
    const src = new SqliteDatabase(codexDbPath);
    src.prepare(`UPDATE catalog_heroes SET portrait_path = NULL, base_hp = 12345 WHERE slug = 'silas'`).run();
    src.close();

    initOutfitter();
    const silasAfter = db.prepare(`SELECT portrait_path, base_hp FROM catalog_heroes WHERE slug = 'silas'`).get() as {
      portrait_path: string | null;
      base_hp: number;
    };
    expect(silasAfter).toEqual({ portrait_path: '/hero-images/heroes/silas.webp', base_hp: 12345 });
  });
});
