import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { requireAbsoluteSqlitePath } from './sqlitePath.js';

describe('requireAbsoluteSqlitePath', () => {
  it('returns trimmed absolute paths', () => {
    const absolute = path.resolve('session.db');
    expect(requireAbsoluteSqlitePath('SESSION_DB_PATH', ` ${absolute} `)).toBe(absolute);
  });

  it('rejects missing values', () => {
    expect(() => requireAbsoluteSqlitePath('SESSION_DB_PATH', undefined)).toThrow(
      'SESSION_DB_PATH must be set to an absolute SQLite path.',
    );
  });

  it('rejects relative paths', () => {
    expect(() => requireAbsoluteSqlitePath('WARFRAME_CATALOG_DB_PATH', './data/warframe-catalog.db')).toThrow(
      'WARFRAME_CATALOG_DB_PATH must be absolute; relative paths are not supported.',
    );
  });
});
