import { Router } from 'express';

import { getClerkAuthState, getCodexAppId, requireAuthApi } from '../core.ts';
import {
  CODEX_GAMES as REGISTRY_CODEX_GAMES,
  getGameMetadata,
  unknownGameMetadata,
} from '../games/metadataRegistry.ts';

export const authRouter = Router();

const FALLBACK_CODEX_GAMES = ['warframe', 'epic7', 'wor'] as const;
const CODEX_GAMES = REGISTRY_CODEX_GAMES.length > 0 ? REGISTRY_CODEX_GAMES : FALLBACK_CODEX_GAMES;

authRouter.get('/me', requireAuthApi, (req, res) => {
  const state = getClerkAuthState(req);
  if (!state.authenticated || !state.userId) {
    res.status(401).json({
      authenticated: false,
      userId: null,
      isAdmin: false,
      isCodexAdmin: false,
      apps: [],
    });
    return;
  }
  const apps = CODEX_GAMES.map((id) => {
    const metadata = getGameMetadata(id) ?? {
      ...unknownGameMetadata,
      url: `/${id}`,
    };
    return { id, ...metadata };
  });
  res.json({
    authenticated: true,
    userId: state.userId,
    isAdmin: state.isCodexAdmin,
    isCodexAdmin: state.isCodexAdmin,
    app: getCodexAppId(),
    apps,
  });
});

authRouter.post('/logout', (_req, res) => {
  res.json({ ok: true, next: '/' });
});
