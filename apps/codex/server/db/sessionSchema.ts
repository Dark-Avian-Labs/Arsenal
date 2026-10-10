import { ensureWarframeSyncJobsSchema } from '../services/warframeSyncJobs.js';
import { createSessionSchema, getSessionDb } from './sessionDb.js';

export function ensureSessionSchema(): void {
  const db = getSessionDb();
  createSessionSchema(db);
  ensureWarframeSyncJobsSchema(db);
}
