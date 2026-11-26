import { SqliteDatabase } from '@dark-avian-labs/server-kit';
import { describe, expect, it } from 'vitest';

import { createAppSchema } from './appDb.ts';
import * as q from './queries.ts';

function memoryDb(): SqliteDatabase {
  const db = new SqliteDatabase(':memory:');
  createAppSchema(db);
  db.prepare(`INSERT INTO game_accounts (clerk_user_id, account_name, is_active) VALUES ('u1', 'main', 1)`).run();
  db.prepare(
    `INSERT INTO catalog_heroes (slug, name, class, faction, rarity, star_rating) VALUES
       ('ezio', 'Ezio', 'fighter', 'watchguard', 'legendary', 5),
       ('aira', 'Aira', 'mage', 'sylvan', 'legendary', 5)`,
  ).run();
  db.prepare(
    `INSERT INTO catalog_artifacts (
       slug, name, class, rarity, star_rating, exclusive_hero_slug, is_universal
     ) VALUES
       ('auditore-blade', 'Auditore Blade', null, 'mythic', 5, 'ezio', 0),
       ('golden-scarab', 'Golden Scarab', 'marksman', 'mythic', 5, null, 0)`,
  ).run();
  return db;
}

function gearPiece(slot: q.GearWrite['slot'], mainBonus = 1.2): q.GearWrite {
  return {
    slot,
    set_key: slot === 'weapon' || slot === 'armor' ? 'calamity' : 'fatality',
    prefix: 'none',
    main_stat: slot === 'armor' ? 'hp' : slot === 'weapon' ? 'atk' : 'atkBonus',
    main_value: slot === 'armor' ? 3960 : slot === 'weapon' ? 1056 : 60,
    main_bonus: mainBonus,
    substats: [],
    exclusive_hero_slug: null,
    exclusive_faction: null,
  };
}

describe('gear queries & loadout atomicity', () => {
  it('equips, overwrites per slot, moves between heroes, and changes slot without colliding', () => {
    const db = memoryDb();
    const first = q.insertGear(db, 1, gearPiece('weapon', 1.2));
    const second = q.insertGear(db, 1, gearPiece('weapon', 2.4));

    q.equipGearSlot(db, 1, first, 'ezio');
    q.equipGearSlot(db, 1, second, 'ezio');
    expect(q.getGear(db, 1, second)?.equipped_hero_slug).toBe('ezio');
    expect(q.getGear(db, 1, first)?.equipped_hero_slug).toBeNull();

    q.equipGearSlot(db, 1, second, 'aira');
    expect(q.getGear(db, 1, second)?.equipped_hero_slug).toBe('aira');
    q.equipGearSlot(db, 1, second, null);
    expect(q.getGear(db, 1, second)?.equipped_hero_slug).toBeNull();

    const armorId = q.insertGear(db, 1, gearPiece('armor', 0));
    q.equipGearSlot(db, 1, first, 'ezio');
    q.equipGearSlot(db, 1, armorId, 'ezio');

    q.updateGearWithEquip(db, 1, first, { ...gearPiece('armor', 0), main_value: 3000 }, 'ezio');
    expect(q.getGear(db, 1, first)?.slot).toBe('armor');
    expect(q.getGear(db, 1, first)?.equipped_hero_slug).toBe('ezio');
    expect(q.getGear(db, 1, armorId)?.equipped_hero_slug).toBeNull();
  });

  it('saveLoadout equips all 5 slots atomically and rolls back when a duplicate slot is passed', () => {
    const db = memoryDb();
    const weapon = q.insertGear(db, 1, gearPiece('weapon'));
    const armor = q.insertGear(db, 1, gearPiece('armor'));
    const bangle = q.insertGear(db, 1, gearPiece('bangle'));
    const amulet = q.insertGear(db, 1, gearPiece('amulet'));
    const ring = q.insertGear(db, 1, gearPiece('ring'));
    const secondWeapon = q.insertGear(db, 1, gearPiece('weapon', 2.0));

    q.saveLoadout(db, 1, 'ezio', [weapon, armor, bangle, amulet, ring]);
    for (const id of [weapon, armor, bangle, amulet, ring]) {
      expect(q.getGear(db, 1, id)?.equipped_hero_slug).toBe('ezio');
    }

    // Passing two weapons fails without clearing Ezio's existing valid loadout.
    expect(() => q.saveLoadout(db, 1, 'aira', [weapon, secondWeapon, bangle, amulet, ring])).toThrow();
    expect(q.getGear(db, 1, weapon)?.equipped_hero_slug).toBe('ezio');
  });
});

describe('artifact & account queries', () => {
  it('inserts, lists, and swaps one artifact per hero and reports catalog counts', () => {
    const db = memoryDb();
    const id = q.insertArtifact(db, 1, {
      catalog_slug: 'golden-scarab',
      level: 25,
      promotion: 5,
      hp_base: 4650,
      hp_bonus: 2520,
      atk_base: 1497,
      atk_bonus: 335,
      secondary_stat: 'atkSpd',
      secondary_value: 49,
    });
    expect(q.listArtifacts(db, 1)).toHaveLength(1);

    q.equipArtifact(db, 1, 'ezio', id);
    expect(q.getEquippedArtifact(db, 1, 'ezio')?.id).toBe(id);

    const other = q.insertArtifact(db, 1, {
      catalog_slug: 'auditore-blade',
      level: 22,
      promotion: 5,
      hp_base: 4300,
      hp_bonus: 1840,
      atk_base: 1407,
      atk_bonus: 230,
      secondary_stat: null,
      secondary_value: null,
    });
    q.equipArtifact(db, 1, 'ezio', other);
    expect(q.getEquippedArtifact(db, 1, 'ezio')?.catalog_slug).toBe('auditore-blade');
    expect(q.getArtifact(db, 1, id)?.equipped_hero_slug).toBeNull();
    expect(q.catalogStatus(db)).toEqual({ heroes: 2, artifacts: 2, missingStats: 2 });
  });

  it('exposes duplicate names, missing rows, and the account cap as client errors', () => {
    const db = memoryDb();
    expect(() => q.createAccount(db, 'u1', 'main')).toThrow(
      expect.objectContaining({ status: 409, expose: true, message: 'Account name already used' }),
    );
    expect(() => q.deleteGear(db, 1, 999)).toThrow(expect.objectContaining({ status: 404, expose: true }));
    for (let index = 1; index < q.MAX_ACCOUNTS_PER_USER; index += 1) {
      q.createAccount(db, 'u1', `alt ${index}`);
    }
    expect(() => q.createAccount(db, 'u1', 'one more')).toThrow(expect.objectContaining({ status: 409, expose: true }));
  });
});
