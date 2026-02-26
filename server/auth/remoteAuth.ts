import type { Request, Response } from 'express';

import { GAME_ID } from '../config.js';

const LOCAL_AUTH_SERVICE_FALLBACK = 'http://localhost:3010';

function parseBaseUrl(
  rawValue: string | undefined,
  envName: string,
): string | null {
  const trimmed = rawValue?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      console.warn(
        `[auth.remoteAuth] Ignoring ${envName}: URL must use http/https protocol.`,
      );
      return null;
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    console.warn(`[auth.remoteAuth] Ignoring ${envName}: invalid base URL.`);
    return null;
  }
}

const parsedFallbackAuthServiceUrl = parseBaseUrl(
  process.env.AUTH_FALLBACK_SERVICE_URL,
  'AUTH_FALLBACK_SERVICE_URL',
);
const parsedPrimaryAuthServiceUrl = parseBaseUrl(
  process.env.AUTH_SERVICE_URL,
  'AUTH_SERVICE_URL',
);

if (
  process.env.AUTH_FALLBACK_SERVICE_URL?.trim() &&
  process.env.AUTH_SERVICE_URL?.trim() &&
  !parsedFallbackAuthServiceUrl &&
  !parsedPrimaryAuthServiceUrl
) {
  console.warn(
    `[auth.remoteAuth] Both AUTH_FALLBACK_SERVICE_URL and AUTH_SERVICE_URL are invalid; falling back to ${LOCAL_AUTH_SERVICE_FALLBACK}.`,
  );
}

const DEFAULT_AUTH_SERVICE_URL =
  parsedFallbackAuthServiceUrl ?? LOCAL_AUTH_SERVICE_FALLBACK;
const AUTH_SERVICE_URL =
  parsedPrimaryAuthServiceUrl ?? DEFAULT_AUTH_SERVICE_URL;
const AUTH_FETCH_TIMEOUT_MS = Number.parseInt(
  process.env.AUTH_FETCH_TIMEOUT_MS ?? '5000',
  10,
);
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const AUTH_STATE_CACHE_KEY = Symbol('appBaseAuthStateCache');

function resolveAuthServiceUrl(req?: Request): string {
  if (!req) return AUTH_SERVICE_URL;
  try {
    const configuredHost = new URL(AUTH_SERVICE_URL).host.toLowerCase();
    const currentHost = getHost(req).toLowerCase();
    if (configuredHost === currentHost) {
      return DEFAULT_AUTH_SERVICE_URL;
    }
  } catch {
    return DEFAULT_AUTH_SERVICE_URL;
  }
  return AUTH_SERVICE_URL;
}

export interface RemoteAuthUser {
  id: number;
  username: string;
  is_admin: boolean;
}

export interface RemoteAuthState {
  authenticated: boolean;
  has_game_access: boolean;
  user: RemoteAuthUser | null;
  permissions: string[];
}

function getProto(req: Request): string {
  const configuredBase = process.env.APP_PUBLIC_BASE_URL?.trim();
  if (configuredBase) {
    try {
      return new URL(configuredBase).protocol.replace(':', '');
    } catch {
      // fall back below
    }
  }
  if (process.env.NODE_ENV === 'production') return 'https';
  return req.protocol;
}

function getHost(req: Request): string {
  const configuredBase = process.env.APP_PUBLIC_BASE_URL?.trim();
  if (configuredBase) {
    try {
      return new URL(configuredBase).host;
    } catch {
      // fall back below
    }
  }
  return req.get('host') || 'localhost';
}

type AuthStateCache = Partial<Record<string, Promise<RemoteAuthState>>>;

function cacheKeyForGame(gameId?: string): string {
  return gameId ?? '__global__';
}

function getRequestAuthCache(req: Request): AuthStateCache {
  const reqWithCache = req as Request & {
    [AUTH_STATE_CACHE_KEY]?: AuthStateCache;
  };
  if (!reqWithCache[AUTH_STATE_CACHE_KEY]) {
    reqWithCache[AUTH_STATE_CACHE_KEY] = {};
  }
  return reqWithCache[AUTH_STATE_CACHE_KEY];
}

export function buildAuthLoginUrl(req: Request, nextPath?: string): string {
  const host = getHost(req);
  const proto = getProto(req);
  const requested = nextPath || req.originalUrl || '/';
  const next = `${proto}://${host}${requested}`;
  const loginUrl = new URL(`${resolveAuthServiceUrl(req)}/login`);
  loginUrl.searchParams.set('next', next);
  return loginUrl.toString();
}

export async function fetchRemoteAuthState(
  req: Request,
  gameId = GAME_ID,
): Promise<RemoteAuthState> {
  const cache = getRequestAuthCache(req);
  const cacheKey = cacheKeyForGame(gameId);
  if (cache[cacheKey]) return await cache[cacheKey];

  cache[cacheKey] = (async () => {
    const meUrl = new URL(`${resolveAuthServiceUrl(req)}/api/auth/me`);
    meUrl.searchParams.set('app', gameId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AUTH_FETCH_TIMEOUT_MS);
    try {
      const upstream = await fetch(meUrl, {
        method: 'GET',
        headers: {
          cookie: req.headers.cookie ?? '',
          accept: 'application/json',
        },
        signal: controller.signal,
      });
      if (!upstream.ok) {
        return {
          authenticated: false,
          has_game_access: false,
          user: null,
          permissions: [],
        };
      }
      const body = (await upstream.json()) as Partial<RemoteAuthState>;
      const user = body.user;
      return {
        authenticated: body.authenticated === true,
        has_game_access: body.has_game_access === true,
        user:
          user &&
          typeof user.id === 'number' &&
          typeof user.username === 'string' &&
          typeof user.is_admin === 'boolean'
            ? user
            : null,
        permissions: Array.isArray(body.permissions)
          ? body.permissions.filter((p): p is string => typeof p === 'string')
          : [],
      };
    } catch {
      return {
        authenticated: false,
        has_game_access: false,
        user: null,
        permissions: [],
      };
    } finally {
      clearTimeout(timeout);
    }
  })();

  return await cache[cacheKey];
}

export async function syncSessionFromAuth(
  req: Request,
): Promise<RemoteAuthState> {
  const state = await fetchRemoteAuthState(req, GAME_ID);
  if (!state.authenticated || !state.user) {
    delete req.session.user_id;
    delete req.session.username;
    delete req.session.is_admin;
    delete req.session.login_time;
    return state;
  }
  req.session.user_id = state.user.id;
  req.session.username = state.user.username;
  req.session.is_admin = state.user.is_admin;
  if (
    typeof req.session.login_time !== 'number' ||
    Date.now() - req.session.login_time > SESSION_TOUCH_INTERVAL_MS
  ) {
    req.session.login_time = Date.now();
  }
  return state;
}

export async function proxyAuthJson(
  req: Request,
  res: Response,
  path: string,
): Promise<void> {
  const url = `${resolveAuthServiceUrl(req)}${path}`;
  const method = req.method.toUpperCase();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: req.headers.cookie ?? '',
      },
      body: method === 'GET' ? undefined : JSON.stringify(req.body ?? {}),
      signal: controller.signal,
    });

    const setCookies = (
      upstream.headers as Headers & {
        getSetCookie?: () => string[];
      }
    ).getSetCookie?.();
    if (setCookies && setCookies.length > 0) {
      res.setHeader('set-cookie', setCookies);
    }

    const contentType = upstream.headers.get('content-type');
    const responseText = await upstream.text();
    res.status(upstream.status);
    if (contentType && contentType.includes('application/json')) {
      res.type('application/json');
    }
    res.send(responseText);
  } catch {
    res.status(502).json({ error: 'Auth service unavailable' });
  } finally {
    clearTimeout(timeout);
  }
}

export async function proxyAuthLogout(
  req: Request,
  res: Response,
): Promise<void> {
  const host = getHost(req);
  const proto = getProto(req);
  const next = `${proto}://${host}/login`;
  const logoutUrl = new URL(`${resolveAuthServiceUrl(req)}/logout`);
  logoutUrl.searchParams.set('next', next);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(logoutUrl, {
      method: 'GET',
      headers: {
        cookie: req.headers.cookie ?? '',
        accept: 'text/html',
      },
      redirect: 'manual',
      signal: controller.signal,
    });

    const setCookies = (
      upstream.headers as Headers & {
        getSetCookie?: () => string[];
      }
    ).getSetCookie?.();

    if (setCookies && setCookies.length > 0) {
      res.setHeader('set-cookie', setCookies);
    }

    req.session.destroy(() => {
      res.json({ success: true });
    });
  } catch {
    req.session.destroy(() => {
      res.status(502).json({ error: 'Auth service unavailable' });
    });
  } finally {
    clearTimeout(timeout);
  }
}
