import { DatabaseSync } from 'node:sqlite';

export type SqliteNativeProbeResult = { available: boolean; reason?: string };

export function probeSqliteNative(): SqliteNativeProbeResult {
  try {
    const db = new DatabaseSync(':memory:');
    db.close();
    return { available: true };
  } catch (err) {
    return {
      available: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export function isSqliteNativeAvailable(): boolean {
  return true;
}

export function getSqliteSkipReason(): string | undefined {
  return undefined;
}
