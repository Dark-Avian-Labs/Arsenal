import { SqliteDatabase } from '@dark-avian-labs/server-kit';
import { describe, expect, it } from 'vitest';

import { EQUIPMENT_SLOT_CONFIGS } from './equipmentSlotConfig.ts';
import {
  convertEquipmentArtifactSlotsFromOverframe,
  convertWarframeArtifactSlotsFromOverframe,
  migrateArtifactSlotsFromOverframe,
  weaponSlotConfig,
} from './migrateArtifactSlotsFromOverframe.ts';

describe('convertWarframeArtifactSlotsFromOverframe', () => {
  it('maps Overframe 12-slot Ash layout to compact 10-slot', () => {
    const legacy = [
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_ATTACK',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_ATTACK',
      'AP_ATTACK',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
    ];
    expect(convertWarframeArtifactSlotsFromOverframe(legacy)).toEqual([
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_ATTACK',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_ATTACK',
      'AP_ATTACK',
      'AP_UNIVERSAL',
    ]);
  });
});

describe('convertEquipmentArtifactSlotsFromOverframe', () => {
  it('maps 10-slot LongGun Overframe to 9-slot storage', () => {
    const legacy = [
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_TACTIC',
      'AP_UNIVERSAL',
    ];
    const converted = convertEquipmentArtifactSlotsFromOverframe(legacy, weaponSlotConfig('LongGuns', 1));
    expect(converted).toHaveLength(9);
    expect(converted[8]).toBe('AP_TACTIC');
  });

  it('maps 11-slot melee Overframe to 10-slot storage', () => {
    const legacy = [
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
      'AP_DEFENSE',
      'AP_WARD',
      'AP_UNIVERSAL',
      'AP_UNIVERSAL',
    ];
    const converted = convertEquipmentArtifactSlotsFromOverframe(legacy, EQUIPMENT_SLOT_CONFIGS.melee);
    expect(converted).toHaveLength(10);
    expect(converted[8]).toBe('AP_WARD');
    expect(converted[9]).toBe('AP_UNIVERSAL');
  });
});

describe('migrateArtifactSlotsFromOverframe', () => {
  it('converts warframe rows instead of clearing them', () => {
    const db = new SqliteDatabase(':memory:');
    db.exec(`
      CREATE TABLE warframes (
        unique_name TEXT PRIMARY KEY,
        name TEXT,
        product_category TEXT,
        artifact_slots TEXT
      );
      CREATE TABLE weapons (
        unique_name TEXT PRIMARY KEY,
        product_category TEXT,
        slot INTEGER,
        artifact_slots TEXT
      );
      CREATE TABLE companions (unique_name TEXT PRIMARY KEY, artifact_slots TEXT);
    `);
    db.prepare(`INSERT INTO warframes VALUES (?, ?, ?, ?)`).run(
      '/Lotus/Ash',
      'Ash',
      'Suits',
      JSON.stringify(Array(12).fill('AP_ATTACK')),
    );

    const summary = migrateArtifactSlotsFromOverframe(db);
    expect(summary.warframesConverted).toBe(1);
    const ash = JSON.parse(
      (
        db.prepare(`SELECT artifact_slots FROM warframes WHERE name='Ash'`).get() as {
          artifact_slots: string;
        }
      ).artifact_slots,
    ) as string[];
    expect(ash).toHaveLength(10);
    db.close();
  });

  it('migrates Jade to 11 slots, Necramechs to 12 slots, and leaves DB untouched on dryRun', () => {
    const db = new SqliteDatabase(':memory:');
    db.exec(`
      CREATE TABLE warframes (
        unique_name TEXT PRIMARY KEY,
        name TEXT,
        product_category TEXT,
        artifact_slots TEXT
      );
      CREATE TABLE weapons (
        unique_name TEXT PRIMARY KEY,
        product_category TEXT,
        slot INTEGER,
        artifact_slots TEXT
      );
      CREATE TABLE companions (unique_name TEXT PRIMARY KEY, artifact_slots TEXT);
    `);
    const raw12 = JSON.stringify([
      ...Array(8).fill('AP_UNIVERSAL'),
      'AP_ANY',
      'AP_DEFENSE',
      'AP_TACTIC',
      'AP_UNIVERSAL',
    ]);
    db.prepare(`INSERT INTO warframes VALUES (?, ?, ?, ?)`).run('/Lotus/Powersuits/Jade/Jade', 'Jade', 'Suits', raw12);
    db.prepare(`INSERT INTO warframes VALUES (?, ?, ?, ?)`).run(
      '/Lotus/Powersuits/EntratiMech/NechroTech',
      'Voidrig',
      'MechSuits',
      raw12,
    );

    const dry = migrateArtifactSlotsFromOverframe(db, { dryRun: true });
    expect(dry.warframesJadeUpdated).toBe(1);
    expect(dry.warframesNecramechUpdated).toBe(1);
    expect(
      (
        db.prepare(`SELECT artifact_slots FROM warframes WHERE name='Jade'`).get() as {
          artifact_slots: string;
        }
      ).artifact_slots,
    ).toBe(raw12);

    migrateArtifactSlotsFromOverframe(db);
    const jade = JSON.parse(
      (
        db.prepare(`SELECT artifact_slots FROM warframes WHERE name='Jade'`).get() as {
          artifact_slots: string;
        }
      ).artifact_slots,
    ) as string[];
    const voidrig = JSON.parse(
      (
        db.prepare(`SELECT artifact_slots FROM warframes WHERE name='Voidrig'`).get() as {
          artifact_slots: string;
        }
      ).artifact_slots,
    ) as string[];
    expect(jade).toHaveLength(11);
    expect(voidrig).toHaveLength(12);
    db.close();
  });
});
