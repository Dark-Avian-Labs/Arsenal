import fs from 'node:fs';

import { log, SqliteDatabase } from '@dark-avian-labs/server-kit';

import { WARFRAME_CATALOG_DB_PATH, WOR_CATALOG_DB_PATH } from './config.ts';
import { getWorCatalogDb, getWorDb, worQueries } from './games/wor/index.ts';
import { copyCatalogToCollection } from './import/warframe/copyCatalogToCollection.ts';
import { copyWorCatalogToCollection } from './import/wor/copyCatalogToCollection.ts';

/**
 * Production-safe catalog refresh run on server boot after an out-of-band CI catalog swap.
 * Imports zero devDependencies (no scrapers) and preserves all user ownership / cell data.
 */
export function syncCatalogSnapshotsToCollectionsOnBoot(): void {
  if (fs.existsSync(WOR_CATALOG_DB_PATH) && fs.statSync(WOR_CATALOG_DB_PATH).size > 0) {
    try {
      const catalogDb = getWorCatalogDb();
      const appDb = getWorDb();
      if (worQueries.catalogHasEntries(catalogDb)) {
        const catalogVersion = worQueries.getCatalogVersion(catalogDb);
        const collectionVersion = worQueries.getCatalogVersion(appDb);
        if (!worQueries.catalogHasEntries(appDb) || catalogVersion !== collectionVersion) {
          copyWorCatalogToCollection(catalogDb, appDb);
          appDb
            .transaction(() => {
              worQueries.pruneInactiveCatalogAccountRows(appDb);
              worQueries.syncNewCatalogEntriesToAllAccounts(appDb);
              worQueries.syncAccountCatalogMetadata(appDb);
            })
            .immediate();
          log('info', 'Refreshed WoR collection DB from updated catalog snapshot on boot', {
            previousVersion: collectionVersion,
            catalogVersion,
          });
        }
      }
    } catch (err) {
      log('error', 'Failed to refresh WoR collection from catalog snapshot on boot', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (fs.existsSync(WARFRAME_CATALOG_DB_PATH) && fs.statSync(WARFRAME_CATALOG_DB_PATH).size > 0) {
    let hasWarframes = false;
    try {
      const ro = new SqliteDatabase(WARFRAME_CATALOG_DB_PATH, {
        readonly: true,
        fileMustExist: true,
      });
      try {
        const table = ro
          .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'warframes'")
          .get();
        if (table) {
          const count = ro.prepare('SELECT COUNT(*) AS c FROM warframes').get() as { c: number };
          hasWarframes = count.c > 0;
        }
      } finally {
        ro.close();
      }
    } catch {
      hasWarframes = false;
    }
    if (hasWarframes) {
      try {
        copyCatalogToCollection();
      } catch (err) {
        log('error', 'Failed to refresh Warframe collection from catalog snapshot on boot', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
