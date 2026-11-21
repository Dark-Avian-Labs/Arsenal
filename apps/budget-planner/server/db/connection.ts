import { createDbSingleton, type SqliteDatabase } from '@dark-avian-labs/server-kit';

import { APP_DB_PATH } from '../config.ts';

const appSingleton = createDbSingleton(APP_DB_PATH);

export function getAppDb(): SqliteDatabase {
  return appSingleton.getDb();
}

export function closeAppDb(): void {
  appSingleton.closeDb();
}
