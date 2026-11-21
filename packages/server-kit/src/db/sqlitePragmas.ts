export const DEFAULT_SQLITE_PRAGMAS = [
  'journal_mode = WAL',
  'synchronous = NORMAL',
  'temp_store = MEMORY',
  'busy_timeout = 5000',
] as const;
