import { SqliteDatabase } from '@dark-avian-labs/server-kit';

import { applyUserSchema } from '../db/userSchema.ts';
import { minimalModConfig } from '../routes/modConfigValidation.ts';

export function createMemoryUserDb(): SqliteDatabase {
  const db = new SqliteDatabase(':memory:');
  db.pragma('foreign_keys = ON');
  applyUserSchema(db);
  return db;
}

export function insertTestBuild(
  db: SqliteDatabase,
  overrides: {
    clerkUserId?: string;
    name?: string;
    visibility?: string;
    shareToken?: string | null;
    equipmentType?: string;
    equipmentUniqueName?: string;
  } = {},
): number {
  const result = db
    .prepare(
      `INSERT INTO builds (clerk_user_id, name, visibility, share_token, equipment_type, equipment_unique_name, mod_config)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      overrides.clerkUserId ?? 'user_owner',
      overrides.name ?? 'Test',
      overrides.visibility ?? 'private',
      overrides.shareToken ?? null,
      overrides.equipmentType ?? 'warframe',
      overrides.equipmentUniqueName ?? '/Lotus/Powersuits/Excalibur/Excalibur',
      JSON.stringify(minimalModConfig()),
    );
  return Number(result.lastInsertRowid);
}

export function insertTestLoadout(
  db: SqliteDatabase,
  overrides: {
    clerkUserId?: string;
    name?: string;
    visibility?: string;
    shareToken?: string | null;
  } = {},
): number {
  const result = db
    .prepare(
      `INSERT INTO loadouts (clerk_user_id, name, visibility, share_token)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      overrides.clerkUserId ?? 'user_owner',
      overrides.name ?? 'Squad',
      overrides.visibility ?? 'private',
      overrides.shareToken ?? null,
    );
  return Number(result.lastInsertRowid);
}

export function linkLoadoutBuild(
  db: SqliteDatabase,
  loadoutId: number,
  buildId: number,
  slotType = 'warframe',
): void {
  db.prepare('INSERT INTO loadout_builds (loadout_id, build_id, slot_type) VALUES (?, ?, ?)').run(
    loadoutId,
    buildId,
    slotType,
  );
}
