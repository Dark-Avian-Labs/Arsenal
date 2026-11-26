import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyUnifiedSubAppEnv, resolveUnifiedDataPaths } from './config.ts';

describe('Arsenal unified sub-app config', () => {
  let tmpDir: string | null = null;
  let savedEnv: Record<string, string | undefined> = {};

  const TOUCHED_KEYS = [
    'ARSENAL_SKIP_LOAD_ENV',
    'ARSENAL_UNIFIED_HOST',
    'APP_ID',
    'APP_NAME',
    'DATA_DIR',
    'BASE_DOMAIN',
    'WARFRAME_DB_PATH',
    'WARFRAME_CATALOG_DB_PATH',
    'EPIC7_DB_PATH',
    'WOR_DB_PATH',
    'WOR_CATALOG_DB_PATH',
    'WARFRAME_IMAGES_DIR',
    'WOR_IMAGES_DIR',
    'ARMORY_DB_PATH',
    'USER_DB_PATH',
    'ARMORY_IMAGES_DIR',
    'CODEX_WARFRAME_CATALOG_DB_PATH',
    'CODEX_WARFRAME_IMAGES_DIR',
    'OUTFITTER_DB_PATH',
    'HERO_IMAGES_DIR',
    'CODEX_WOR_DB_PATH',
    'CODEX_WOR_IMAGES_DIR',
    'BUDGET_DB_PATH',
  ] as const;

  afterEach(() => {
    for (const key of TOUCHED_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    savedEnv = {};
    vi.unstubAllEnvs();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  function snapshotEnv(): void {
    for (const key of TOUCHED_KEYS) savedEnv[key] = process.env[key];
  }

  it('isolates sub-app env, deletes host APP_ID/APP_NAME, and keeps armory.db distinct from warframe-catalog.db', () => {
    snapshotEnv();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arsenal-unified-env-'));

    for (const key of TOUCHED_KEYS) delete process.env[key];
    process.env.APP_ID = 'arsenal';
    process.env.APP_NAME = 'Arsenal';

    const paths = applyUnifiedSubAppEnv(tmpDir);

    expect(process.env.ARSENAL_SKIP_LOAD_ENV).toBe('1');
    expect(process.env.ARSENAL_UNIFIED_HOST).toBe('1');
    expect(process.env.APP_ID).toBeUndefined();
    expect(process.env.APP_NAME).toBeUndefined();
    expect(process.env.BASE_DOMAIN).toBe('darkavianlabs.com');
    expect(process.env.DATA_DIR).toBe(tmpDir);

    // Armory keeps its own armory.db (for armory_users) while reading Codex's immutable catalog.
    expect(paths.armoryDb).not.toBe(paths.warframeCatalogDb);
    expect(process.env.ARMORY_DB_PATH).toBe(path.join(tmpDir, 'armory.db'));
    expect(process.env.USER_DB_PATH).toBe(path.join(tmpDir, 'builds.db'));
    expect(process.env.CODEX_WARFRAME_CATALOG_DB_PATH).toBe(path.join(tmpDir, 'warframe-catalog.db'));

    // Outfitter reads Codex's WoR catalog & portrait directory directly.
    expect(process.env.CODEX_WOR_DB_PATH).toBe(path.join(tmpDir, 'wor-catalog.db'));
    expect(process.env.HERO_IMAGES_DIR).toBe(path.join(tmpDir, 'images', 'wor'));
    expect(process.env.BUDGET_DB_PATH).toBe(path.join(tmpDir, 'budget.db'));

    expect(fs.existsSync(paths.warframeImagesDir)).toBe(true);
    expect(fs.existsSync(paths.worImagesDir)).toBe(true);
  });

  it('honors explicit DB path overrides in resolveUnifiedDataPaths', () => {
    snapshotEnv();
    process.env.BUDGET_DB_PATH = '  /custom/budget.db  ';
    process.env.ARMORY_DB_PATH = '/custom/armory.db';
    const paths = resolveUnifiedDataPaths('/tmp/data');
    expect(paths.budgetDb).toBe('/custom/budget.db');
    expect(paths.armoryDb).toBe('/custom/armory.db');
  });
});
