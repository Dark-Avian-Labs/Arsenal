import { requireAuthApi } from '@dark-avian-labs/server-kit';
import { Router } from 'express';

import {
  planWorImport,
  type ImportMode,
  type PlannedArtifact,
  type PlannedGear,
  type StashArtifact,
  type StashGear,
} from '../../shared/worImport.ts';
import { getAppDb } from '../db/appDb.ts';
import * as q from '../db/queries.ts';
import { requireAccountId } from '../http/account.ts';
import { asyncHandler, json, sendError } from '../http/handlers.ts';

export const importRouter = Router();
importRouter.use(requireAuthApi);

const MODES = new Set<ImportMode>(['restore', 'sync', 'skip']);

function mode(value: unknown, fallback: ImportMode): ImportMode {
  return typeof value === 'string' && MODES.has(value as ImportMode)
    ? (value as ImportMode)
    : fallback;
}

function optionsFrom(body: Record<string, unknown>) {
  return {
    gearMode: mode(body.gear_mode, 'sync'),
    artifactMode: mode(body.artifact_mode, 'sync'),
    plus16Only: body.gear_plus_16_only !== false,
  };
}

function buildPlan(accountId: number, body: Record<string, unknown>) {
  const db = getAppDb();
  const options = optionsFrom(body);
  const gear = q.listGear(db, accountId).map((row): StashGear => ({
    id: row.id,
    game_uid: row.game_uid,
    slot: row.slot,
    set_key: row.set_key,
    main_stat: row.main_stat,
    main_value: row.main_value,
    main_bonus: row.main_bonus,
    sub1_stat: row.sub1_stat,
    sub1_value: row.sub1_value,
    sub2_stat: row.sub2_stat,
    sub2_value: row.sub2_value,
    sub3_stat: row.sub3_stat,
    sub3_value: row.sub3_value,
    sub4_stat: row.sub4_stat,
    sub4_value: row.sub4_value,
  }));
  const artifacts = q.listArtifacts(db, accountId).map((row): StashArtifact => ({
    id: row.id,
    game_uid: row.game_uid,
    catalog_slug: row.catalog_slug,
    level: row.level,
    promotion: row.promotion,
    hp_base: row.hp_base,
    hp_bonus: row.hp_bonus,
    atk_base: row.atk_base,
    atk_bonus: row.atk_bonus,
    secondary_stat: row.secondary_stat,
    secondary_value: row.secondary_value,
  }));
  const catalog = q.listCatalogArtifacts(db).map((row) => ({
    slug: row.slug,
    name: row.name,
    rarity: row.rarity,
    star_rating: row.star_rating,
  }));
  return planWorImport(body.file, gear, artifacts, catalog, options);
}

function applyGear(
  accountId: number,
  rows: PlannedGear[],
  links: { id: number; game_uid: string }[],
  mode: ImportMode,
  missing: number[],
  deleteMissing: boolean,
): void {
  const db = getAppDb();
  if (mode === 'skip') return;
  if (mode === 'restore') q.deleteAccountGear(db, accountId);
  for (const row of rows) {
    if (row.match_id == null) {
      q.insertGear(db, accountId, { ...row.write, game_uid: row.game_uid });
      continue;
    }
    q.updateGear(db, accountId, row.match_id, row.write);
    q.setGearGameUid(db, accountId, row.match_id, row.game_uid);
  }
  for (const link of links) q.setGearGameUid(db, accountId, link.id, link.game_uid);
  if (deleteMissing) {
    for (const id of missing) q.deleteGear(db, accountId, id);
  }
}

function applyArtifacts(
  accountId: number,
  rows: PlannedArtifact[],
  links: { id: number; game_uid: string }[],
  mode: ImportMode,
  missing: number[],
  deleteMissing: boolean,
): void {
  const db = getAppDb();
  if (mode === 'skip') return;
  if (mode === 'restore') q.deleteAccountArtifacts(db, accountId);
  for (const row of rows) {
    if (row.match_id == null) {
      q.insertArtifact(db, accountId, { ...row.write, game_uid: row.game_uid });
      continue;
    }
    q.updateArtifact(db, accountId, row.match_id, row.write);
    q.setArtifactGameUid(db, accountId, row.match_id, row.game_uid);
  }
  for (const link of links) q.setArtifactGameUid(db, accountId, link.id, link.game_uid);
  if (deleteMissing) {
    for (const id of missing) q.deleteArtifact(db, accountId, id);
  }
}

importRouter.post(
  '/preview',
  asyncHandler((req, res) => {
    const accountId = requireAccountId(req, res);
    if (accountId == null) return;
    const body = req.body;
    if (!body || typeof body !== 'object') {
      sendError(res, 'Invalid body.');
      return;
    }
    const planned = buildPlan(accountId, body as Record<string, unknown>);
    if ('error' in planned) {
      sendError(res, planned.error);
      return;
    }
    json(res, planned.plan);
  }),
);

importRouter.post(
  '/',
  asyncHandler((req, res) => {
    const accountId = requireAccountId(req, res);
    if (accountId == null) return;
    const body = req.body;
    if (!body || typeof body !== 'object') {
      sendError(res, 'Invalid body.');
      return;
    }
    const record = body as Record<string, unknown>;
    const options = optionsFrom(record);
    const planned = buildPlan(accountId, record);
    if ('error' in planned) {
      sendError(res, planned.error);
      return;
    }
    const deleteMissing = record.delete_missing === true && !options.plus16Only;
    const db = getAppDb();
    const gearRows = [...planned.plan.gear.update, ...planned.plan.gear.add];
    const artifactRows = [...planned.plan.artifacts.update, ...planned.plan.artifacts.add];
    db.transaction(() => {
      applyGear(
        accountId,
        gearRows,
        planned.plan.gear.links,
        options.gearMode,
        planned.plan.gear.missing.map((row) => row.id),
        deleteMissing && options.gearMode === 'sync',
      );
      applyArtifacts(
        accountId,
        artifactRows,
        planned.plan.artifacts.links,
        options.artifactMode,
        planned.plan.artifacts.missing.map((row) => row.id),
        deleteMissing && options.artifactMode === 'sync',
      );
    })();
    json(res, {
      gear: q.listGear(db, accountId).length,
      artifacts: q.listArtifacts(db, accountId).length,
    });
  }),
);
