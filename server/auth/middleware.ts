import type { Request, Response, NextFunction } from 'express';

import { buildAuthLoginUrl, fetchRemoteAuthState, syncSessionFromAuth } from './remoteAuth.js';

function wantsJson(req: Request): boolean {
  return req.accepts('json') !== false;
}

function touchSessionFromState(
  req: Request,
  state: { user: { id: number; username: string; is_admin: boolean } | null },
): void {
  if (!state.user) return;
  req.session.user_id = state.user.id;
  req.session.username = state.user.username;
  req.session.is_admin = state.user.is_admin;
  if (
    typeof req.session.login_time !== 'number' ||
    Date.now() - req.session.login_time > 5 * 60 * 1000
  ) {
    req.session.login_time = Date.now();
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const state = await syncSessionFromAuth(req);
  if (state.authenticated) {
    next();
    return;
  }
  if (wantsJson(req)) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  res.redirect(buildAuthLoginUrl(req));
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const state = await syncSessionFromAuth(req);
  if (!state.authenticated || !state.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!state.user.is_admin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

export function requireGameAccess(gameId: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const state = await fetchRemoteAuthState(req, gameId);
    if (!state.authenticated || !state.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    touchSessionFromState(req, state);
    if (!state.has_game_access) {
      res.status(403).json({ error: 'Access to this application is not granted.' });
      return;
    }
    next();
  };
}

export function requireAuthApi(req: Request, res: Response, next: NextFunction): Promise<void> {
  return requireAuth(req, res, next);
}

export async function requirePageGameAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const state = await fetchRemoteAuthState(req);
  if (!state.authenticated || !state.user) {
    res.redirect(buildAuthLoginUrl(req));
    return;
  }
  touchSessionFromState(req, state);
  if (!state.has_game_access) {
    res.redirect(buildAuthLoginUrl(req, '/'));
    return;
  }
  next();
}

export async function redirectIfAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const state = await fetchRemoteAuthState(req);
  if (state.authenticated && state.has_game_access) {
    res.redirect('/');
    return;
  }
  next();
}

export function authLoginRedirect(req: Request, res: Response): void {
  res.redirect(buildAuthLoginUrl(req));
}

export async function authStatus(req: Request, res: Response): Promise<void> {
  const state = await fetchRemoteAuthState(req);
  if (!state.authenticated || !state.user) {
    res.json({ authenticated: false, has_game_access: false });
    return;
  }
  res.json({
    authenticated: true,
    has_game_access: state.has_game_access,
    user: state.user,
    permissions: state.permissions,
  });
}

export async function requireAuthApiJson(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const state = await syncSessionFromAuth(req);
  if (state.authenticated) {
    next();
    return;
  }
  res.status(401).json({ error: 'Unauthorized' });
}
