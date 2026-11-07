import {
  backfillModDescriptions,
  bindCatalogQueries,
  processExports,
} from '@dark-avian-labs/warframe-catalog/server';

import { EXPORTS_DIR } from '../../../config.ts';
import { restoreModAtragraphPaths, saveModAtragraphPaths } from '../scraping/atragraphModsWiki.ts';
import { getCatalogDb } from './connection.ts';

bindCatalogQueries({
  getDb: getCatalogDb,
  exportsDir: EXPORTS_DIR,
  saveModAtragraphPaths,
  restoreModAtragraphPaths,
});

export { backfillModDescriptions, processExports };
