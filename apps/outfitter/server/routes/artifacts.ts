import { requireAuthApi } from '@dark-avian-labs/server-kit';
import { Router } from 'express';

import { parseArtifactBody } from '../../shared/schemas.js';
import { getAppDb } from '../db/appDb.js';
import * as q from '../db/queries.js';
import { requireAccountId } from '../http/account.js';
import { asyncHandler, json, sendError } from '../http/handlers.js';

export const artifactsRouter = Router();
artifactsRouter.use(requireAuthApi);

function catalogSlugs(): Set<string> {
  return new Set(q.listCatalogArtifacts(getAppDb()).map((row) => row.slug));
}

artifactsRouter.get(
  '/',
  asyncHandler((req, res) => {
    const accountId = requireAccountId(req, res);
    if (accountId == null) return;
    const db = getAppDb();
    json(res, {
      artifacts: q.listArtifacts(db, accountId),
      catalog: q.listCatalogArtifacts(db),
    });
  }),
);

artifactsRouter.post(
  '/',
  asyncHandler((req, res) => {
    const accountId = requireAccountId(req, res);
    if (accountId == null) return;
    const parsed = parseArtifactBody(req.body, catalogSlugs());
    if (typeof parsed === 'string') {
      sendError(res, parsed);
      return;
    }
    const db = getAppDb();
    const id = q.insertArtifact(db, accountId, parsed);
    json(res, { artifact: q.getArtifact(db, accountId, id) }, 201);
  }),
);

artifactsRouter.patch(
  '/:id',
  asyncHandler((req, res) => {
    const accountId = requireAccountId(req, res);
    if (accountId == null) return;
    const artifactId = Number(req.params.id);
    if (!Number.isInteger(artifactId) || artifactId <= 0) {
      sendError(res, 'Invalid artifact id.');
      return;
    }
    const parsed = parseArtifactBody(req.body, catalogSlugs());
    if (typeof parsed === 'string') {
      sendError(res, parsed);
      return;
    }
    const db = getAppDb();
    if (!q.getArtifact(db, accountId, artifactId)) {
      sendError(res, 'Artifact not found.', 404);
      return;
    }
    q.updateArtifact(db, accountId, artifactId, parsed);
    json(res, { artifact: q.getArtifact(db, accountId, artifactId) });
  }),
);

artifactsRouter.delete(
  '/:id',
  asyncHandler((req, res) => {
    const accountId = requireAccountId(req, res);
    if (accountId == null) return;
    const artifactId = Number(req.params.id);
    if (!Number.isInteger(artifactId) || artifactId <= 0) {
      sendError(res, 'Invalid artifact id.');
      return;
    }
    q.deleteArtifact(getAppDb(), accountId, artifactId);
    json(res, { ok: true });
  }),
);
