import type { Request, Response } from 'express';

import { getAppDb } from '../db/appDb.ts';
import { requireClerkUserId, sendError } from './handlers.ts';

export function requireAccountId(req: Request, res: Response): number | null {
  const clerkUserId = requireClerkUserId(req);
  const row = getAppDb()
    .prepare('SELECT id FROM game_accounts WHERE clerk_user_id = ? AND is_active = 1')
    .get(clerkUserId) as { id: number } | undefined;
  if (!row) {
    sendError(res, 'No game account selected. Create one first.', 400);
    return null;
  }
  return row.id;
}
