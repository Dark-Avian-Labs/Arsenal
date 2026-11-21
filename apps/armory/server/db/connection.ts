import { createDbSingleton, type SqliteDatabase } from '@dark-avian-labs/server-kit';

import { ARMORY_DB_PATH, USER_DB_PATH } from '../config.ts';

const catalogSingleton = createDbSingleton(ARMORY_DB_PATH);
const userSingleton = createDbSingleton(USER_DB_PATH);

export function getCatalogDb(): SqliteDatabase {
  return catalogSingleton.getDb();
}

export function getUserDb(): SqliteDatabase {
  return userSingleton.getDb();
}

export function closeAll(): void {
  catalogSingleton.closeDb();
  userSingleton.closeDb();
}
