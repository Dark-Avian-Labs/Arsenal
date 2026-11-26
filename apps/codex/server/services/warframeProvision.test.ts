import { SqliteDatabase } from '@dark-avian-labs/server-kit';
import { afterEach, expect, it } from 'vitest';

import {
  createSchema,
  ensureWarframeCatalogMasterTable,
  ensureWarframeCatalogMaxLevelColumn,
  ensureWarframeRowOrphanColumn,
} from '../games/warframe/db/schema.ts';
import { warframeQueries } from '../games/warframe/index.ts';
import { describeWithSqlite } from '../testing/describeWithSqlite.ts';
import { provisionWarframeUserIfNeeded } from './warframeProvision.ts';

describeWithSqlite('provisionWarframeUserIfNeeded', () => {
  let db: SqliteDatabase | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  function createFreshDb(): SqliteDatabase {
    const fresh = new SqliteDatabase(':memory:');
    createSchema(fresh, true);
    ensureWarframeCatalogMasterTable(fresh);
    ensureWarframeCatalogMaxLevelColumn(fresh);
    ensureWarframeRowOrphanColumn(fresh);
    return fresh;
  }

  it('creates empty worksheet shells when catalog_rows is empty and is idempotent', () => {
    db = createFreshDb();

    provisionWarframeUserIfNeeded(db, 'user_empty');
    const first = warframeQueries.getWorksheets(db, 'user_empty');
    expect(first.length).toBeGreaterThan(0);

    // Second call must not duplicate worksheets.
    provisionWarframeUserIfNeeded(db, 'user_empty');
    expect(warframeQueries.getWorksheets(db, 'user_empty')).toHaveLength(first.length);
  });

  it('provisions worksheets and rows from catalog_rows when master catalog is populated', () => {
    db = createFreshDb();
    db.prepare(
      `INSERT INTO catalog_rows (worksheet_name, canonical_key, item_name, display_order, max_level)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('Warframes', 'excalibur', 'Excalibur', 0, 30);

    provisionWarframeUserIfNeeded(db, 'user_seeded');
    const worksheets = warframeQueries.getWorksheets(db, 'user_seeded');
    const wfSheet = worksheets.find((w) => w.name === 'Warframes');
    expect(wfSheet).toBeDefined();

    const rows = db.prepare('SELECT item_name FROM rows WHERE worksheet_id = ?').all(wfSheet!.id) as Array<{
      item_name: string;
    }>;
    expect(rows.map((r) => r.item_name)).toContain('Excalibur');
  });
});
