import { createWarframeCatalogSchema } from '@dark-avian-labs/warframe-catalog/server';

import { getCatalogDb } from './connection.ts';
import { createUserSchema } from './userSchema.ts';

export function createCatalogSchema(): void {
  createWarframeCatalogSchema(getCatalogDb());
}

export function createAppSchema(): void {
  createCatalogSchema();
  createUserSchema();
}

export { createUserSchema } from './userSchema.ts';
