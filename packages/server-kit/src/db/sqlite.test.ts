import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createDbSingleton, openMemorySqlite, SqliteDatabase } from './sqlite.ts';

describe('SqliteDatabase (node:sqlite adapter)', () => {
  it('normalizes row prototypes, named params, and array params, and rejects unknown named params', () => {
    const db = openMemorySqlite();
    try {
      db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL)');
      const ins = db.prepare('INSERT INTO items (name) VALUES (:name)');
      const res = ins.run({ name: 'alpha' });
      expect(res.changes).toBe(1);
      expect(res.lastInsertRowid).toBe(1);
      expect(() => ins.run({ name: 'beta', typo: 123 })).toThrow();

      const row = db.prepare('SELECT id, name FROM items WHERE id = ?').get([1]);
      expect(row).toEqual({ id: 1, name: 'alpha' });
      expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    } finally {
      db.close();
    }
  });

  it('maps SQLite extended error codes to better-sqlite3 compatible .code strings', () => {
    const db = openMemorySqlite();
    try {
      db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL)');
      db.prepare('INSERT INTO users (email) VALUES (?)').run('a@example.com');
      let caught: { code?: string } | null = null;
      try {
        db.prepare('INSERT INTO users (email) VALUES (?)').run('a@example.com');
      } catch (error) {
        caught = error as { code?: string };
      }
      expect(caught?.code).toBe('SQLITE_CONSTRAINT_UNIQUE');
    } finally {
      db.close();
    }
  });

  it('supports transactions, nested savepoints, immediate mode, and rollbacks', () => {
    const db = openMemorySqlite();
    try {
      db.exec('CREATE TABLE log (v TEXT NOT NULL)');
      const insert = db.prepare('INSERT INTO log (v) VALUES (?)');

      const innerFail = db.transaction(() => {
        insert.run('inner');
        throw new Error('boom');
      });
      const outer = db.transaction(() => {
        insert.run('outer');
        expect(() => innerFail()).toThrow('boom');
      });
      outer.immediate();

      const rows = db.prepare('SELECT v FROM log').all() as Array<{ v: string }>;
      expect(rows).toEqual([{ v: 'outer' }]);
    } finally {
      db.close();
    }
  });

  it('rejects async/thenable transaction callbacks and preserves 64-bit lastInsertRowid', () => {
    const db = openMemorySqlite();
    try {
      db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL)');
      const insert = db.prepare('INSERT INTO t (id, v) VALUES (?, ?)');
      const bigId = 9007199254740995n;
      const runRes = insert.run(bigId, 'big');
      expect(runRes.lastInsertRowid).toBe(bigId);
      expect(db.prepare('SELECT id, v FROM t WHERE id = ?').get(bigId)).toEqual({
        id: bigId,
        v: 'big',
      });
      expect(db.prepare('SELECT id, v FROM t').all()).toEqual([{ id: bigId, v: 'big' }]);

      const asyncTx = db.transaction(async () => {
        insert.run(2, 'should-rollback');
      });
      expect(() => asyncTx()).toThrow(TypeError);
      expect(db.prepare('SELECT v FROM t WHERE id = 2').get()).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it('enforces fileMustExist and readonly mode and resets singleton on close', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dal-sqlite-'));
    const dbPath = path.join(dir, 'test.db');
    try {
      expect(() => new SqliteDatabase(dbPath, { fileMustExist: true })).toThrow();

      const singleton = createDbSingleton(dbPath, {
        onOpen: (db) => {
          db.exec('CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT)');
          db.prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)').run('a', '1');
        },
      });
      const first = singleton.getDb();
      expect(first.open).toBe(true);
      expect(first.pragma('journal_mode', { simple: true })).toBe('wal');
      first.close();
      expect(first.open).toBe(false);

      const ro = new SqliteDatabase(dbPath, { readonly: true, fileMustExist: true });
      try {
        expect(ro.prepare('SELECT v FROM kv WHERE k = ?').get('a')).toEqual({ v: '1' });
        expect(() => ro.prepare('INSERT INTO kv (k, v) VALUES (?, ?)').run('b', '2')).toThrow();
      } finally {
        ro.close();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
