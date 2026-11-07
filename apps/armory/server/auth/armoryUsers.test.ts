import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ current: null as Database.Database | null }));

vi.mock('@clerk/express', () => ({ clerkClient: {} }));
vi.mock('../db/connection.ts', () => ({ getCatalogDb: () => db.current }));

import { markArmoryUserDeleted, resolveClerkUserIdByUsername, upsertArmoryUser } from './armoryUsers.ts';

describe('armory users', () => {
  it('lets a username move to a new owner after delete or rename', () => {
    db.current = new Database(':memory:');
    db.current.exec(`
      CREATE TABLE armory_users (
        clerk_user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        deleted_at TEXT
      );
      INSERT INTO armory_users VALUES ('user_old', 'ghost', datetime('now'));
    `);

    upsertArmoryUser('user_new', 'Ghost');
    expect(resolveClerkUserIdByUsername('ghost')).toBe('user_new');

    upsertArmoryUser('user_a', 'alice');
    markArmoryUserDeleted('user_a');
    upsertArmoryUser('user_b', 'Alice');
    expect(resolveClerkUserIdByUsername('alice')).toBe('user_b');

    upsertArmoryUser('user_c', 'bob');
    upsertArmoryUser('user_d', 'BOB');
    expect(resolveClerkUserIdByUsername('bob')).toBe('user_d');
    expect(db.current.prepare("SELECT username FROM armory_users WHERE clerk_user_id = 'user_c'").get()).toEqual({
      username: null,
    });
  });
});
