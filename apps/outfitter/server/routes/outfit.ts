import { requireAuthApi } from '@dark-avian-labs/server-kit';
import { Router } from 'express';

import { outfitHeroSchema, outfitPieceIdsSchema } from '../../shared/schemas.ts';
import { getAppDb } from '../db/appDb.ts';
import * as q from '../db/queries.ts';
import { requireAccountId } from '../http/account.ts';
import { asyncHandler, json, sendError } from '../http/handlers.ts';

export const outfitRouter = Router();
outfitRouter.use(requireAuthApi);

outfitRouter.post(
  '/save',
  asyncHandler((req, res) => {
    const accountId = requireAccountId(req, res);
    if (accountId == null) return;
    const heroSlug = outfitHeroSchema.parse(req.body?.hero_slug);
    const hero = q.getHero(getAppDb(), accountId, heroSlug);
    if (!hero) {
      sendError(res, 'Hero not found.', 404);
      return;
    }
    const parsedIds = outfitPieceIdsSchema.safeParse(req.body?.piece_ids);
    if (!parsedIds.success) {
      sendError(res, 'Exactly five gear piece ids are required.');
      return;
    }
    const pieceIds = parsedIds.data;
    const db = getAppDb();
    const pieces = pieceIds.map((id: number) => q.getGear(db, accountId, id));
    if (pieces.some((piece: q.GearPieceRow | undefined) => !piece)) {
      sendError(res, 'One or more pieces were not found.', 404);
      return;
    }
    const slots = new Set(pieces.map((piece: q.GearPieceRow | undefined) => piece?.slot));
    if (slots.size !== 5) {
      sendError(res, 'Loadout must include one piece of each slot.');
      return;
    }
    q.saveLoadout(db, accountId, heroSlug, pieceIds);
    json(res, { ok: true });
  }),
);
