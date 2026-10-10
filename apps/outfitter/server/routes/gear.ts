import { requireAuthApi } from '@dark-avian-labs/server-kit';
import { Router } from 'express';

import { parseGearBody } from '../../shared/schemas.ts';
import { getAppDb } from '../db/appDb.ts';
import * as q from '../db/queries.ts';
import { requireAccountId } from '../http/account.ts';
import { asyncHandler, json, sendError } from '../http/handlers.ts';

export const gearRouter = Router();
gearRouter.use(requireAuthApi);

function requireEquippedHero(
  db: ReturnType<typeof getAppDb>,
  accountId: number,
  slug: string | null,
): string | null {
  if (slug == null) return null;
  if (!q.getHero(db, accountId, slug)) return 'Hero not found.';
  return null;
}

gearRouter.get(
  '/',
  asyncHandler((req, res) => {
    const accountId = requireAccountId(req, res);
    if (accountId == null) return;
    json(res, { gear: q.listGear(getAppDb(), accountId) });
  }),
);

gearRouter.post(
  '/',
  asyncHandler((req, res) => {
    const accountId = requireAccountId(req, res);
    if (accountId == null) return;
    const parsed = parseGearBody(req.body);
    if (typeof parsed === 'string') {
      sendError(res, parsed);
      return;
    }
    const db = getAppDb();
    const equippedError = requireEquippedHero(db, accountId, parsed.equipped_hero_slug);
    if (equippedError) {
      sendError(res, equippedError, 404);
      return;
    }
    const id = db.transaction(() => {
      const gearId = q.insertGear(db, accountId, parsed.write);
      q.equipGearSlot(db, accountId, gearId, parsed.equipped_hero_slug);
      return gearId;
    })();
    json(res, { gear: q.getGear(db, accountId, id) }, 201);
  }),
);

gearRouter.patch(
  '/:id',
  asyncHandler((req, res) => {
    const accountId = requireAccountId(req, res);
    if (accountId == null) return;
    const gearId = Number(req.params.id);
    if (!Number.isInteger(gearId) || gearId <= 0) {
      sendError(res, 'Invalid gear id.');
      return;
    }
    const parsed = parseGearBody(req.body);
    if (typeof parsed === 'string') {
      sendError(res, parsed);
      return;
    }
    const db = getAppDb();
    if (!q.getGear(db, accountId, gearId)) {
      sendError(res, 'Gear piece not found.', 404);
      return;
    }
    const equippedError = requireEquippedHero(db, accountId, parsed.equipped_hero_slug);
    if (equippedError) {
      sendError(res, equippedError, 404);
      return;
    }
    q.updateGearWithEquip(db, accountId, gearId, parsed.write, parsed.equipped_hero_slug);
    json(res, { gear: q.getGear(db, accountId, gearId) });
  }),
);

gearRouter.delete(
  '/:id',
  asyncHandler((req, res) => {
    const accountId = requireAccountId(req, res);
    if (accountId == null) return;
    const gearId = Number(req.params.id);
    if (!Number.isInteger(gearId) || gearId <= 0) {
      sendError(res, 'Invalid gear id.');
      return;
    }
    q.deleteGear(getAppDb(), accountId, gearId);
    json(res, { ok: true });
  }),
);
