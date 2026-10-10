import { createWarframeCatalogSchema } from '@dark-avian-labs/warframe-catalog/server';

import { ensureImportRunsSchema } from '../importRuns.ts';
import { getCatalogDb } from './connection.ts';

export function createCatalogSchema(): void {
  createWarframeCatalogSchema(getCatalogDb(), { afterTables: ensureImportRunsSchema });
}
