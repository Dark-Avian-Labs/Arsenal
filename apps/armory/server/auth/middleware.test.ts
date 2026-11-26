import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  userId: null as string | null,
  sessionClaims: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@clerk/express', () => ({
  getAuth: () => ({
    userId: authState.userId,
    sessionClaims: authState.sessionClaims,
  }),
  clerkMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import { mockResponse } from '../testing/mockResponse.ts';
import { getClerkAuthState, requireArmoryAdmin } from './middleware.ts';

describe('Armory auth middleware', () => {
  beforeEach(() => {
    vi.stubEnv('CLERK_PUBLISHABLE_KEY', 'pk_test_armoryunit');
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_armoryunit');
    authState.userId = null;
    authState.sessionClaims = undefined;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves authenticated admin, non-admin, unauthenticated, and unconfigured states', () => {
    authState.userId = 'user_1';
    authState.sessionClaims = { metadata: { apps: { armory: 'admin' } } };
    expect(getClerkAuthState({} as Request)).toEqual({
      authenticated: true,
      userId: 'user_1',
      isArmoryAdmin: true,
    });

    authState.userId = 'user_2';
    authState.sessionClaims = { metadata: { apps: { armory: 'user' } } };
    expect(getClerkAuthState({} as Request)).toEqual({
      authenticated: true,
      userId: 'user_2',
      isArmoryAdmin: false,
    });

    authState.userId = null;
    expect(getClerkAuthState({} as Request)).toEqual({
      authenticated: false,
      userId: null,
      isArmoryAdmin: false,
    });

    vi.stubEnv('CLERK_PUBLISHABLE_KEY', '');
    vi.stubEnv('CLERK_SECRET_KEY', '');
    authState.userId = 'user_1';
    expect(getClerkAuthState({} as Request)).toEqual({
      authenticated: false,
      userId: null,
      isArmoryAdmin: false,
    });
  });

  it('enforces 401 unauthenticated, 403 non-admin, and passes armory admin in requireArmoryAdmin', () => {
    const res401 = mockResponse();
    const next1 = vi.fn();
    requireArmoryAdmin({} as Request, res401, next1);
    expect(res401.statusCode).toBe(401);
    expect(next1).not.toHaveBeenCalled();

    authState.userId = 'user_1';
    authState.sessionClaims = { metadata: { apps: { armory: 'user' } } };
    const res403 = mockResponse();
    const next2 = vi.fn();
    requireArmoryAdmin({} as Request, res403, next2);
    expect(res403.statusCode).toBe(403);
    expect(res403.body).toEqual({ error: 'Game admin access required' });
    expect(next2).not.toHaveBeenCalled();

    authState.sessionClaims = { metadata: { apps: { armory: 'admin' } } };
    const res200 = mockResponse();
    const next3 = vi.fn();
    requireArmoryAdmin({} as Request, res200, next3);
    expect(next3).toHaveBeenCalledOnce();
  });
});
