import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SqliteDatabase } from '@dark-avian-labs/server-kit';
import { createWarframeCatalogSchema } from '@dark-avian-labs/warframe-catalog/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

function writeCatalogSnapshot(dbPath: string, warframes: Array<{ uniqueName: string; name: string }>): void {
  fs.rmSync(dbPath, { force: true });
  const db = new SqliteDatabase(dbPath);
  try {
    createWarframeCatalogSchema(db);
    const insert = db.prepare(
      'INSERT INTO warframes (unique_name, name, health, shield, armor, power, sprint_speed, mastery_req, product_category) VALUES (?, ?, 100, 100, 100, 100, 1.0, 0, ?)',
    );
    for (const wf of warframes) {
      insert.run(wf.uniqueName, wf.name, 'Suits');
    }
  } finally {
    db.close();
  }
}

describe('initArmory catalog sync detection', () => {
  let tmpDir: string | null = null;
  let savedEnv: Record<string, string | undefined> = {};

  afterEach(async () => {
    try {
      const { closeArmory } = await import('./init.ts');
      closeArmory();
    } catch {
      // ignore if not loaded
    }
    vi.resetModules();
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    savedEnv = {};
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('re-syncs Armory when warframe-catalog.db changes even with an older mtime, and preserves armory_users', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'armory-init-sync-'));
    const codexCatalogPath = path.join(tmpDir, 'warframe-catalog.db');
    const armoryDbPath = path.join(tmpDir, 'armory.db');
    const buildsDbPath = path.join(tmpDir, 'builds.db');

    const envKeys = [
      'ARSENAL_SKIP_LOAD_ENV',
      'DATA_DIR',
      'ARMORY_DB_PATH',
      'ARMORY_BUILDS_DB_PATH',
      'CODEX_WARFRAME_CATALOG_DB_PATH',
      'ARMORY_IMAGES_DIR',
      'CODEX_WARFRAME_IMAGES_DIR',
    ];
    for (const k of envKeys) savedEnv[k] = process.env[k];

    process.env.ARSENAL_SKIP_LOAD_ENV = '1';
    process.env.DATA_DIR = tmpDir;
    process.env.ARMORY_DB_PATH = armoryDbPath;
    process.env.ARMORY_BUILDS_DB_PATH = buildsDbPath;
    process.env.CODEX_WARFRAME_CATALOG_DB_PATH = codexCatalogPath;
    process.env.ARMORY_IMAGES_DIR = path.join(tmpDir, 'images');
    process.env.CODEX_WARFRAME_IMAGES_DIR = path.join(tmpDir, 'images');

    // Initial catalog with 1 warframe.
    writeCatalogSnapshot(codexCatalogPath, [{ uniqueName: '/wf/Excalibur', name: 'Excalibur' }]);

    vi.resetModules();
    const { initArmory, closeArmory } = await import('./init.ts');
    const { getCatalogDb } = await import('./db/connection.ts');
    const { upsertArmoryUser } = await import('./auth/armoryUsers.ts');

    initArmory();
    expect((getCatalogDb().prepare('SELECT COUNT(*) AS c FROM warframes').get() as { c: number }).c).toBe(1);

    // Simulate a Clerk webhook writing to armory_users (which advances armory.db mtime).
    upsertArmoryUser('user_123', 'tenno');

    // Swap in a 2-warframe catalog whose mtime is 10 minutes in the past (older than armory.db).
    writeCatalogSnapshot(codexCatalogPath, [
      { uniqueName: '/wf/Excalibur', name: 'Excalibur' },
      { uniqueName: '/wf/Volt', name: 'Volt' },
    ]);
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    fs.utimesSync(codexCatalogPath, tenMinAgo, tenMinAgo);

    initArmory();
    expect((getCatalogDb().prepare('SELECT COUNT(*) AS c FROM warframes').get() as { c: number }).c).toBe(2);

    // Verify armory_users survived the catalog sync intact.
    const user = getCatalogDb().prepare('SELECT username FROM armory_users WHERE clerk_user_id = ?').get('user_123') as
      | { username: string }
      | undefined;
    expect(user?.username).toBe('tenno');

    // Simulate a .prev rollback to the 1-warframe catalog (also with an older mtime).
    writeCatalogSnapshot(codexCatalogPath, [{ uniqueName: '/wf/Excalibur', name: 'Excalibur' }]);
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);
    fs.utimesSync(codexCatalogPath, twentyMinAgo, twentyMinAgo);

    initArmory();
    expect((getCatalogDb().prepare('SELECT COUNT(*) AS c FROM warframes').get() as { c: number }).c).toBe(1);

    closeArmory();
  });
});
