import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { openMemorySqlite, SqliteDatabase } from '@dark-avian-labs/server-kit';
import { afterEach, describe, expect, it } from 'vitest';

import { ARCANE_PUBLIC_LIST_SQL, bindArcanePublicListParams, UNRELEASED_ARCANE_UNIQUE_NAMES } from './arcaneCatalog.ts';
import { ensureCatalogKeyColumns } from './catalogMigrations.ts';
import { createWarframeCatalogSchema } from './catalogSchema.ts';
import { bindCatalogQueries, processExports } from './queries.ts';

describe('warframe-catalog schema, migrations, and processExports', () => {
  let db: SqliteDatabase | null = null;
  let tmpDir: string | null = null;

  afterEach(() => {
    db?.close();
    db = null;
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('renames legacy atagraph_card_path to atragraph_card_path and adds key columns idempotently', () => {
    db = openMemorySqlite();
    db.exec(`
      CREATE TABLE abilities (unique_name TEXT PRIMARY KEY);
      CREATE TABLE archon_shard_buffs (id INTEGER PRIMARY KEY);
      CREATE TABLE mods (unique_name TEXT PRIMARY KEY, atagraph_card_path TEXT);
      INSERT INTO mods (unique_name, atagraph_card_path) VALUES ('/mod/a', '/img/card.png');
    `);

    ensureCatalogKeyColumns(db);
    ensureCatalogKeyColumns(db);

    const row = db.prepare('SELECT atragraph_card_path FROM mods WHERE unique_name = ?').get('/mod/a') as {
      atragraph_card_path: string;
    };
    expect(row.atragraph_card_path).toBe('/img/card.png');
  });

  it('imports DE exports, preserves image/scraped fields across re-import, resolves generic mod types, and filters unreleased arcanes', () => {
    db = openMemorySqlite();
    createWarframeCatalogSchema(db);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-exports-'));

    fs.writeFileSync(
      path.join(tmpDir, 'ExportWarframes_en.json'),
      JSON.stringify({
        ExportWarframes: [
          {
            uniqueName: '/Lotus/Powersuits/Excalibur/Excalibur',
            name: 'Excalibur',
            health: 270,
            shield: 270,
            armor: 240,
            power: 100,
            sprintSpeed: 1.0,
            masteryReq: 0,
            productCategory: 'Suits',
            abilities: [
              {
                abilityUniqueName: '/Lotus/Powersuits/Excalibur/SlashDashAbility',
                abilityName: 'Slash Dash',
                description: 'Dash and slash',
              },
            ],
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'ExportUpgrades_en.json'),
      JSON.stringify({
        ExportUpgrades: [
          {
            uniqueName: '/Lotus/Upgrades/Mods/TestGeneric',
            name: 'Generic Mod',
            type: '---',
            compatName: 'RIFLE',
            polarity: 'AP_ATTACK',
            rarity: 'RARE',
            baseDrain: 4,
            fusionLimit: 5,
            levelStats: [{ stats: ['+10% Damage'] }],
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'ExportRelicArcane_en.json'),
      JSON.stringify({
        ExportRelicArcane: [
          {
            uniqueName: '/Lotus/Upgrades/CosmeticEnhancers/Offensive/ArcaneEnergize',
            name: 'Arcane Energize',
            rarity: 'LEGENDARY',
            levelStats: [{ stats: ['Energy on pickup'] }],
          },
          {
            uniqueName: UNRELEASED_ARCANE_UNIQUE_NAMES[0],
            name: 'Arcane Survival',
            rarity: 'RARE',
            levelStats: [{ stats: ['Unreleased'] }],
          },
          {
            uniqueName: '/Lotus/Upgrades/CosmeticEnhancers/Offensive/ArcaneExcluded',
            name: 'Excluded Arcane',
            rarity: 'RARE',
            excludeFromCodex: true,
            levelStats: [{ stats: ['Hidden'] }],
          },
        ],
      }),
    );

    const savedAtragraph = new Map<string, { atragraph_card_path: string; foil_overlay_path: string }>();
    bindCatalogQueries({
      getDb: () => db!,
      exportsDir: tmpDir,
      saveModAtragraphPaths: () => savedAtragraph,
      restoreModAtragraphPaths: () => {},
    });

    const first = processExports();
    expect(first.warframes).toBe(1);
    expect(first.abilities).toBe(1);
    expect(first.mods).toBe(1);

    // Annotate scraped/image fields and re-import to verify preservation.
    db.prepare('UPDATE warframes SET image_path = ?, artifact_slots = ? WHERE unique_name = ?').run(
      '/images/excal.png',
      '["AP_ATTACK"]',
      '/Lotus/Powersuits/Excalibur/Excalibur',
    );
    db.prepare('UPDATE abilities SET is_helminth_extractable = 1 WHERE unique_name = ?').run(
      '/Lotus/Powersuits/Excalibur/SlashDashAbility',
    );

    processExports();

    const wf = db
      .prepare('SELECT image_path, artifact_slots FROM warframes WHERE unique_name = ?')
      .get('/Lotus/Powersuits/Excalibur/Excalibur') as {
      image_path: string;
      artifact_slots: string;
    };
    expect(wf).toEqual({ image_path: '/images/excal.png', artifact_slots: '["AP_ATTACK"]' });

    const ab = db
      .prepare('SELECT is_helminth_extractable FROM abilities WHERE unique_name = ?')
      .get('/Lotus/Powersuits/Excalibur/SlashDashAbility') as {
      is_helminth_extractable: number;
    };
    expect(ab.is_helminth_extractable).toBe(1);

    const mod = db
      .prepare('SELECT type, compat_name FROM mods WHERE unique_name = ?')
      .get('/Lotus/Upgrades/Mods/TestGeneric') as { type: string; compat_name: string };
    expect(mod.type).toBe('RIFLE');
    expect(mod.compat_name).toBe('RIFLE');

    // Public arcane SQL excludes both unreleased and exclude_from_codex arcanes.
    const publicArcanes = db
      .prepare(`SELECT unique_name FROM arcanes WHERE ${ARCANE_PUBLIC_LIST_SQL}`)
      .all(...bindArcanePublicListParams()) as Array<{ unique_name: string }>;
    expect(publicArcanes.map((a) => a.unique_name)).toEqual([
      '/Lotus/Upgrades/CosmeticEnhancers/Offensive/ArcaneEnergize',
    ]);
  });
});
