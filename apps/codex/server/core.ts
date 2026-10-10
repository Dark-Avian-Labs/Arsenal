import fs from 'node:fs';
import path from 'node:path';

import { getAuth } from '@clerk/express';
import {
  isAppAdmin,
  isClerkConfigured,
  isEncryptedEnvValue,
  metadataFromSessionClaims,
  requireAuthApi,
} from '@dark-avian-labs/server-kit';
import type { NextFunction, Request, Response } from 'express';

export { requireAuthApi };

export function resolveEnvFilePath(rootPath: string): string | null {
  const normalizedNodeEnv = (process.env.NODE_ENV ?? '').trim().toLowerCase();

  if (normalizedNodeEnv === 'test') {
    const testPath = path.join(rootPath, '.env.test');
    return fs.existsSync(testPath) ? testPath : null;
  }

  if (
    normalizedNodeEnv &&
    normalizedNodeEnv !== 'production' &&
    normalizedNodeEnv !== 'development'
  ) {
    throw new Error(
      `[FATAL] Unsupported NODE_ENV "${process.env.NODE_ENV}". Use production, development, or test.`,
    );
  }

  const isProduction = normalizedNodeEnv !== 'development';
  const fileName = isProduction ? '.env.production' : '.env.development';
  const candidatePath = path.join(rootPath, fileName);
  if (fs.existsSync(candidatePath)) {
    return candidatePath;
  }
  if (isProduction) {
    throw new Error(
      `[FATAL] Missing ${fileName}. Refusing to start production without the matching env file.`,
    );
  }
  return null;
}

const DEFAULT_CODEX_APP_ID = 'codex';

export function getCodexAppId(): string {
  const raw = process.env.APP_ID?.trim().toLowerCase();
  if (!raw || isEncryptedEnvValue(raw)) {
    return DEFAULT_CODEX_APP_ID;
  }
  return raw;
}

function wantsJson(req: Request): boolean {
  return req.accepts(['html', 'json']) === 'json';
}

function sendAuthError(req: Request, res: Response, status: number, message: string): void {
  if (wantsJson(req)) {
    res.status(status).json({ error: message });
  } else {
    res.status(status).send(message);
  }
}

export function getClerkAuthState(req: Request): {
  authenticated: boolean;
  userId: string | null;
  isAdmin: boolean;
  isCodexAdmin: boolean;
} {
  if (!isClerkConfigured()) {
    return { authenticated: false, userId: null, isAdmin: false, isCodexAdmin: false };
  }
  const auth = getAuth(req);
  const userId = auth.userId ?? null;
  const metadata = metadataFromSessionClaims(auth.sessionClaims);
  const isCodexAdmin = isAppAdmin(metadata, getCodexAppId());
  return {
    authenticated: Boolean(userId),
    userId,
    isAdmin: isCodexAdmin,
    isCodexAdmin,
  };
}

export function requireCodexAdmin(req: Request, res: Response, next: NextFunction): void {
  const state = getClerkAuthState(req);
  if (!state.authenticated) {
    sendAuthError(req, res, 401, 'Unauthorized');
    return;
  }
  if (!state.isCodexAdmin) {
    sendAuthError(req, res, 403, 'Codex admin access required');
    return;
  }
  next();
}
