import { getAuth } from '@clerk/express';
import {
  clerkMiddleware,
  isAppAdmin,
  isClerkConfigured,
  metadataFromSessionClaims,
  requireAuthApi,
} from '@dark-avian-labs/server-kit';
import type { NextFunction, Request, Response } from 'express';

import { GAME_ID } from '../gameId.js';

export { clerkMiddleware, getAuth, isClerkConfigured, requireAuthApi };

export type ClerkAuthState = {
  authenticated: boolean;
  userId: string | null;
  isArmoryAdmin: boolean;
};

export function getClerkAuthState(req: Request): ClerkAuthState {
  if (!isClerkConfigured()) {
    return { authenticated: false, userId: null, isArmoryAdmin: false };
  }
  const auth = getAuth(req);
  const userId = auth.userId ?? null;
  const metadata = metadataFromSessionClaims(auth.sessionClaims);
  return {
    authenticated: Boolean(userId),
    userId,
    isArmoryAdmin: isAppAdmin(metadata, GAME_ID),
  };
}

export function requireArmoryAdmin(req: Request, res: Response, next: NextFunction): void {
  const state = getClerkAuthState(req);
  if (!state.authenticated || !state.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!state.isArmoryAdmin) {
    res.status(403).json({ error: 'Game admin access required' });
    return;
  }
  next();
}
