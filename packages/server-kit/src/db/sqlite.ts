import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';

import { DEFAULT_SQLITE_PRAGMAS } from './sqlitePragmas.ts';

export interface SqliteOpenOptions {
  readonly?: boolean;
  fileMustExist?: boolean;
}

export interface SqliteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface SqliteStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): SqliteRunResult;
  iterate(...params: unknown[]): IterableIterator<unknown>;
  columns(): ReturnType<StatementSync['columns']>;
}

export interface SqliteTransaction<F extends (...args: never[]) => unknown> {
  (...args: Parameters<F>): ReturnType<F>;
  deferred(...args: Parameters<F>): ReturnType<F>;
  immediate(...args: Parameters<F>): ReturnType<F>;
  exclusive(...args: Parameters<F>): ReturnType<F>;
}

const SQLITE_ERROR_CODES: Record<number, string> = {
  5: 'SQLITE_BUSY',
  6: 'SQLITE_LOCKED',
  19: 'SQLITE_CONSTRAINT',
  275: 'SQLITE_CONSTRAINT_CHECK',
  787: 'SQLITE_CONSTRAINT_FOREIGNKEY',
  1299: 'SQLITE_CONSTRAINT_NOTNULL',
  1555: 'SQLITE_CONSTRAINT_PRIMARYKEY',
  2067: 'SQLITE_CONSTRAINT_UNIQUE',
  2579: 'SQLITE_CONSTRAINT_ROWID',
};

function mapSqliteError(error: unknown): never {
  if (error && typeof error === 'object') {
    const err = error as { code?: string; errcode?: number };
    if (err.code === 'ERR_SQLITE_ERROR' && typeof err.errcode === 'number') {
      const mapped = SQLITE_ERROR_CODES[err.errcode] ?? SQLITE_ERROR_CODES[err.errcode & 0xff];
      if (mapped) {
        err.code = mapped;
      }
    }
  }
  throw error;
}

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

function normalizeBigInt(value: unknown): unknown {
  if (typeof value === 'bigint' && value <= MAX_SAFE_BIGINT && value >= MIN_SAFE_BIGINT) {
    return Number(value);
  }
  return value;
}

function normalizeRow(row: unknown): unknown {
  if (row !== null && typeof row === 'object') {
    const src = row as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src)) {
      out[key] = normalizeBigInt(src[key]);
    }
    return out;
  }
  return normalizeBigInt(row);
}

function unwrapParams(params: unknown[]): unknown[] {
  if (params.length === 1 && Array.isArray(params[0])) {
    return params[0] as unknown[];
  }
  return params;
}

function bindAndCall<T>(
  params: unknown[],
  invokeNamed: (named: Record<string, SQLInputValue>) => T,
  invokePositional: (...args: SQLInputValue[]) => T,
): T {
  const args = unwrapParams(params);
  if (
    args.length === 1 &&
    args[0] !== null &&
    typeof args[0] === 'object' &&
    !ArrayBuffer.isView(args[0])
  ) {
    return invokeNamed(args[0] as Record<string, SQLInputValue>);
  }
  return invokePositional(...(args as SQLInputValue[]));
}

class WrappedStatement implements SqliteStatement {
  readonly #stmt: StatementSync;

  constructor(stmt: StatementSync) {
    stmt.setAllowBareNamedParameters(true);
    stmt.setReadBigInts(true);
    this.#stmt = stmt;
  }

  get(...params: unknown[]): unknown {
    try {
      const row = bindAndCall(
        params,
        (named) => this.#stmt.get(named),
        (...pos) => this.#stmt.get(...pos),
      );
      return normalizeRow(row);
    } catch (error) {
      mapSqliteError(error);
    }
  }

  all(...params: unknown[]): unknown[] {
    try {
      const rows = bindAndCall(
        params,
        (named) => this.#stmt.all(named),
        (...pos) => this.#stmt.all(...pos),
      );
      return rows.map(normalizeRow);
    } catch (error) {
      mapSqliteError(error);
    }
  }

  run(...params: unknown[]): SqliteRunResult {
    try {
      const res = bindAndCall(
        params,
        (named) => this.#stmt.run(named),
        (...pos) => this.#stmt.run(...pos),
      );
      const changes = Number(res.changes);
      const lastInsertRowid = normalizeBigInt(res.lastInsertRowid) as number | bigint;
      return { changes, lastInsertRowid };
    } catch (error) {
      mapSqliteError(error);
    }
  }

  *iterate(...params: unknown[]): IterableIterator<unknown> {
    try {
      const iter = bindAndCall(
        params,
        (named) => this.#stmt.iterate(named),
        (...pos) => this.#stmt.iterate(...pos),
      );
      for (const row of iter) {
        yield normalizeRow(row);
      }
    } catch (error) {
      mapSqliteError(error);
    }
  }

  columns(): ReturnType<StatementSync['columns']> {
    return this.#stmt.columns();
  }
}

export class SqliteDatabase {
  readonly #db: DatabaseSync;
  readonly name: string;
  readonly readonly: boolean;
  readonly memory: boolean;
  #savepointSeq = 0;

  constructor(dbPath: string, options?: SqliteOpenOptions) {
    const isMemory = dbPath === ':memory:' || dbPath === '';
    const readOnly = Boolean(options?.readonly);
    if ((options?.fileMustExist || readOnly) && !isMemory && !fs.existsSync(dbPath)) {
      throw new Error(`Unable to open database file: ${dbPath} does not exist`);
    }
    this.name = dbPath;
    this.readonly = readOnly;
    this.memory = isMemory;
    this.#db = new DatabaseSync(dbPath, { readOnly });
    if (!isMemory) {
      this.#db.exec('PRAGMA busy_timeout = 5000');
    }
  }

  get open(): boolean {
    return this.#db.isOpen;
  }

  get inTransaction(): boolean {
    return this.#db.isTransaction;
  }

  exec(sql: string): this {
    try {
      this.#db.exec(sql);
      return this;
    } catch (error) {
      mapSqliteError(error);
    }
  }

  prepare(sql: string): SqliteStatement {
    try {
      return new WrappedStatement(this.#db.prepare(sql));
    } catch (error) {
      mapSqliteError(error);
    }
  }

  pragma(source: string, options?: { simple?: boolean }): unknown {
    try {
      const rows = this.#db.prepare(`PRAGMA ${source}`).all().map(normalizeRow);
      if (options?.simple) {
        const first = rows[0] as Record<string, unknown> | undefined;
        if (!first) return undefined;
        const keys = Object.keys(first);
        return keys.length > 0 ? first[keys[0]!] : undefined;
      }
      return rows;
    } catch (error) {
      mapSqliteError(error);
    }
  }

  transaction<F extends (...args: never[]) => unknown>(fn: F): SqliteTransaction<F> {
    const assertNotThenable = (value: unknown): void => {
      if (
        value !== null &&
        (typeof value === 'object' || typeof value === 'function') &&
        typeof (value as { then?: unknown }).then === 'function'
      ) {
        throw new TypeError('Transaction function cannot return a promise');
      }
    };

    const runWithMode = (
      mode: '' | 'DEFERRED' | 'IMMEDIATE' | 'EXCLUSIVE',
      args: Parameters<F>,
    ): ReturnType<F> => {
      if (this.#db.isTransaction) {
        const sp = `dal_sp_${++this.#savepointSeq}`;
        this.#db.exec(`SAVEPOINT ${sp}`);
        try {
          const result = fn(...args) as ReturnType<F>;
          assertNotThenable(result);
          this.#db.exec(`RELEASE SAVEPOINT ${sp}`);
          return result;
        } catch (error) {
          try {
            this.#db.exec(`ROLLBACK TO SAVEPOINT ${sp}`);
            this.#db.exec(`RELEASE SAVEPOINT ${sp}`);
          } catch {
            // Connection may already be closed or rolled back by outer statement.
          }
          throw error;
        }
      }
      this.#db.exec(mode ? `BEGIN ${mode}` : 'BEGIN');
      try {
        const result = fn(...args) as ReturnType<F>;
        assertNotThenable(result);
        this.#db.exec('COMMIT');
        return result;
      } catch (error) {
        if (this.#db.isTransaction) {
          try {
            this.#db.exec('ROLLBACK');
          } catch {
            // Ignore rollback errors after connection failure.
          }
        }
        throw error;
      }
    };

    const tx = ((...args: Parameters<F>) => runWithMode('', args)) as SqliteTransaction<F>;
    tx.deferred = (...args: Parameters<F>) => runWithMode('DEFERRED', args);
    tx.immediate = (...args: Parameters<F>) => runWithMode('IMMEDIATE', args);
    tx.exclusive = (...args: Parameters<F>) => runWithMode('EXCLUSIVE', args);
    return tx;
  }

  close(): this {
    if (this.#db.isOpen) {
      this.#db.close();
    }
    return this;
  }
}

export interface DbSingletonOptions {
  pragmas?: string[];
  onOpen?: (db: SqliteDatabase) => void;
}

export interface DbSingleton {
  getDb(): SqliteDatabase;
  closeDb(): void;
}

export function openSqlite(
  dbPath: string,
  pragmas: readonly string[] = DEFAULT_SQLITE_PRAGMAS,
  options?: SqliteOpenOptions,
): SqliteDatabase {
  const isMemory = dbPath === ':memory:' || dbPath === '';
  if (!isMemory && !options?.readonly) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new SqliteDatabase(dbPath, options);
  if (!options?.readonly) {
    db.pragma('foreign_keys = ON');
    for (const pragma of pragmas) {
      db.pragma(pragma);
    }
  } else {
    db.pragma('busy_timeout = 5000');
  }
  return db;
}

export function openMemorySqlite(pragmas: readonly string[] = []): SqliteDatabase {
  return openSqlite(':memory:', pragmas);
}

export function createDbSingleton(dbPath: string, options?: DbSingletonOptions): DbSingleton {
  let instance: SqliteDatabase | null = null;

  function getDb(): SqliteDatabase {
    if (instance) return instance;
    const db = openSqlite(dbPath, [...DEFAULT_SQLITE_PRAGMAS, ...(options?.pragmas ?? [])]);
    const originalClose = db.close.bind(db);
    db.close = (() => {
      const result = originalClose();
      instance = null;
      return result;
    }) as typeof db.close;
    try {
      options?.onOpen?.(db);
    } catch (err) {
      db.close();
      throw err;
    }
    instance = db;
    return db;
  }

  function closeDb(): void {
    if (instance) {
      instance.close();
    }
  }

  return { getDb, closeDb };
}
