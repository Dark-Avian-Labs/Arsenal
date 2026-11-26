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

import { mockResponse } from '@dark-avian-labs/server-kit/testing';

import { getClerkAuthState, getCodexAppId, requireCodexAdmin } from './core.ts';

describe('getCodexAppId', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to codex, normalizes case, and ignores encrypted values', () => {
    vi.stubEnv('APP_ID', '');
    expect(getCodexAppId()).toBe('codex');

    vi.stubEnv('APP_ID', 'Codex');
    expect(getCodexAppId()).toBe('codex');

    vi.stubEnv('APP_ID', 'encrypted:bkmgizxogipnovixrybd5kaf7cktxstv75e3nn7xbdj');
    expect(getCodexAppId()).toBe('codex');
  });
});

describe('Codex auth middleware', () => {
  beforeEach(() => {
    vi.stubEnv('CLERK_PUBLISHABLE_KEY', 'pk_test_abc');
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_abc');
    authState.userId = null;
    authState.sessionClaims = undefined;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves getClerkAuthState for admin, non-admin, unauthenticated, and unconfigured Clerk', () => {
    expect(getClerkAuthState({} as Request)).toMatchObject({
      authenticated: false,
      isCodexAdmin: false,
    });

    authState.userId = 'user_2';
    authState.sessionClaims = { metadata: { apps: { codex: 'user' } } };
    expect(getClerkAuthState({} as Request)).toMatchObject({
      authenticated: true,
      isCodexAdmin: false,
    });

    authState.userId = 'user_1';
    authState.sessionClaims = { metadata: { apps: { codex: 'admin' } } };
    expect(getClerkAuthState({} as Request).isCodexAdmin).toBe(true);

    vi.stubEnv('CLERK_PUBLISHABLE_KEY', '');
    vi.stubEnv('CLERK_SECRET_KEY', '');
    expect(getClerkAuthState({} as Request)).toEqual({
      authenticated: false,
      userId: null,
      isAdmin: false,
      isCodexAdmin: false,
    });
  });

  it('enforces 401/403 (JSON & HTML negotiation) and allows admin in requireCodexAdmin', () => {
    const jsonReq = { accepts: vi.fn(() => 'json') } as unknown as Request;
    const htmlReq = { accepts: vi.fn(() => 'html') } as unknown as Request;

    const r401 = mockResponse();
    requireCodexAdmin(jsonReq, r401, vi.fn());
    expect(r401.statusCode).toBe(401);

    authState.userId = 'user_1';
    authState.sessionClaims = { metadata: { apps: { codex: 'user' } } };

    const r403Json = mockResponse();
    requireCodexAdmin(jsonReq, r403Json, vi.fn());
    expect(r403Json.statusCode).toBe(403);
    expect(r403Json.body).toEqual({ error: 'Codex admin access required' });

    const r403Html = mockResponse('html');
    requireCodexAdmin(htmlReq, r403Html, vi.fn());
    expect(r403Html.statusCode).toBe(403);
    expect(r403Html.body).toBe('Codex admin access required');

    authState.sessionClaims = { metadata: { apps: { codex: 'admin' } } };
    const next = vi.fn();
    requireCodexAdmin(jsonReq, mockResponse(), next);
    expect(next).toHaveBeenCalledOnce();
  });
});
