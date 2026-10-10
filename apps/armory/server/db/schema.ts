import { createCatalogSchema } from './catalogSchema.ts';
import { createUserSchema } from './userSchema.ts';

export function createAppSchema(): void {
  createCatalogSchema();
  createUserSchema();
}

export { createCatalogSchema } from './catalogSchema.ts';
export { createUserSchema } from './userSchema.ts';
