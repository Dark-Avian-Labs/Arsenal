import { clerkMiddleware as clerkExpressMiddleware, getAuth } from '@clerk/express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { APP_ID } from '../config.js';
import { isAppAdmin, metadataFromSessionClaims } from './clerk.js';
import { getClerkAuthorizedParties } from './clerkAuthorizedParties.js';

export { getAuth };

export function isClerkConfigured(): boolean {
  return Boolean(process.env.CLERK_PUBLISHABLE_KEY?.trim() && process.env.CLERK_SECRET_KEY?.trim());
}

/**
 * Real Clerk middleware when keys are configured; a pass-through otherwise so
 * the template still boots in development before Clerk is set up. In that
 * fallback every request is treated as unauthenticated (`requireAuthApi`
 * responds 401). Production refuses to start without keys (see clerkEnv.ts).
 */
export function clerkMiddleware(): RequestHandler {
  if (!isClerkConfigured()) {
    return (_req, _res, next) => next();
  }
  return clerkExpressMiddleware({ authorizedParties: getClerkAuthorizedParties() });
}

export type ClerkAuthState = {
  authenticated: boolean;
  userId: string | null;
  isAdmin: boolean;
};

export function getClerkAuthState(req: Request): ClerkAuthState {
  if (!isClerkConfigured()) {
    return { authenticated: false, userId: null, isAdmin: false };
  }
  const auth = getAuth(req);
  const userId = auth.userId ?? null;
  const metadata = metadataFromSessionClaims(auth.sessionClaims);
  return {
    authenticated: Boolean(userId),
    userId,
    isAdmin: isAppAdmin(metadata, APP_ID),
  };
}

export function requireAuthApi(req: Request, res: Response, next: NextFunction): void {
  const state = getClerkAuthState(req);
  if (state.authenticated && state.userId) {
    next();
    return;
  }
  res.status(401).json({ error: 'Unauthorized' });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const state = getClerkAuthState(req);
  if (!state.authenticated || !state.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!state.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
