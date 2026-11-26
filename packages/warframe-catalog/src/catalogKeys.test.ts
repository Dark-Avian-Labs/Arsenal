import { SqliteDatabase } from '@dark-avian-labs/server-kit';
import { afterEach, describe, expect, it } from 'vitest';

import {
  backfillArchonBuffArmoryKeys,
  backfillHelminthArmoryKeys,
  catalogArmoryKeyForArchonBuff,
} from './catalogKeys.ts';
import { HELMINTH_REGISTRY_ENTRIES } from './helminthRegistry.ts';

describe('catalogKeys', () => {
  let db: SqliteDatabase | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it('builds canonical Common archon keys and rejects invalid colors or sort orders', () => {
    expect(catalogArmoryKeyForArchonBuff('Crimson', 4)).toBe('/Armory/Archon/Crimson/Common/AbilityStrength');
    expect(catalogArmoryKeyForArchonBuff('NotAColor', 1)).toBeNull();
    expect(catalogArmoryKeyForArchonBuff('Crimson', 99)).toBeNull();
  });

  it('backfills archon_shard_buffs and helminth abilities armory keys without touching unrelated rows', () => {
    const sampleHelminth = HELMINTH_REGISTRY_ENTRIES[0]!;
    const sampleDePath = sampleHelminth.de_paths[0]!;
    db = new SqliteDatabase(':memory:');
    db.exec(`
      CREATE TABLE archon_shard_types (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE archon_shard_buffs (
        id INTEGER PRIMARY KEY,
        shard_type_id INTEGER,
        sort_order INTEGER,
        armory_key TEXT
      );
      CREATE TABLE abilities (
        unique_name TEXT PRIMARY KEY,
        is_helminth_extractable INTEGER DEFAULT 0,
        armory_helminth_key TEXT
      );
      INSERT INTO archon_shard_types (id, name) VALUES (1, 'Violet'), (2, 'Unknown');
      INSERT INTO archon_shard_buffs (id, shard_type_id, sort_order) VALUES (1, 1, 4), (2, 2, 1);
    `);
    db.prepare(
      'INSERT INTO abilities (unique_name, is_helminth_extractable, armory_helminth_key) VALUES (?, ?, ?)',
    ).run(sampleDePath, 1, null);
    db.prepare(
      'INSERT INTO abilities (unique_name, is_helminth_extractable, armory_helminth_key) VALUES (?, ?, ?)',
    ).run('/Lotus/Powersuits/Unknown/Nope', 1, null);
    db.prepare(
      'INSERT INTO abilities (unique_name, is_helminth_extractable, armory_helminth_key) VALUES (?, ?, ?)',
    ).run('/Lotus/Powersuits/Other/NotHelminth', 0, null);

    expect(backfillArchonBuffArmoryKeys(db)).toBe(1);
    expect(
      (
        db.prepare('SELECT armory_key FROM archon_shard_buffs WHERE id = 1').get() as {
          armory_key: string;
        }
      ).armory_key,
    ).toBe('/Armory/Archon/Violet/Common/Equilibrium');

    expect(backfillHelminthArmoryKeys(db)).toBe(1);
    expect(
      (
        db.prepare('SELECT armory_helminth_key FROM abilities WHERE unique_name = ?').get(sampleDePath) as {
          armory_helminth_key: string;
        }
      ).armory_helminth_key,
    ).toBe(sampleHelminth.armory_key);
  });
});
