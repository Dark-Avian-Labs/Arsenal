import { log, type SqliteDatabase } from '@dark-avian-labs/server-kit';

export interface UserCleanupTargets {
  armoryMarkDeleted?: (clerkUserId: string) => void;
  budgetDb?: () => SqliteDatabase | null;
  outfitterDb?: () => SqliteDatabase | null;
  codexWarframeDb?: () => SqliteDatabase | null;
  codexEpic7Db?: () => SqliteDatabase | null;
  codexWorDb?: () => SqliteDatabase | null;
}

function safeDeleteByClerkId(
  db: SqliteDatabase | null | undefined,
  table: string,
  clerkUserId: string,
): number {
  if (!db) return 0;
  try {
    const exists = db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(table);
    if (!exists) return 0;
    return db.prepare(`DELETE FROM ${table} WHERE clerk_user_id = ?`).run(clerkUserId).changes;
  } catch (err) {
    log('warn', 'Unified Clerk user.deleted cleanup skipped table', {
      table,
      err: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

export function deleteClerkUserAcrossApps(
  clerkUserId: string,
  targets: UserCleanupTargets,
): Record<string, number> {
  const summary: Record<string, number> = {};

  if (targets.armoryMarkDeleted) {
    try {
      targets.armoryMarkDeleted(clerkUserId);
      summary.armory = 1;
    } catch (err) {
      log('warn', 'Armory user.deleted handler failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  summary.budgetUsers = safeDeleteByClerkId(targets.budgetDb?.(), 'users', clerkUserId);
  summary.outfitterAccounts = safeDeleteByClerkId(
    targets.outfitterDb?.(),
    'game_accounts',
    clerkUserId,
  );
  summary.codexWarframeSheets = safeDeleteByClerkId(
    targets.codexWarframeDb?.(),
    'worksheets',
    clerkUserId,
  );
  summary.codexEpic7Accounts = safeDeleteByClerkId(
    targets.codexEpic7Db?.(),
    'game_accounts',
    clerkUserId,
  );
  summary.codexWorAccounts = safeDeleteByClerkId(
    targets.codexWorDb?.(),
    'game_accounts',
    clerkUserId,
  );

  log('info', 'Processed unified Clerk user.deleted cleanup', {
    clerkUserId,
    summary,
  });
  return summary;
}
