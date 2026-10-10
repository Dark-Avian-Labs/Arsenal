import { requireAdmin, requireAuthApi } from '@dark-avian-labs/server-kit';
import { Router } from 'express';

import { accountIdSchema, accountNameSchema } from '../../shared/schemas.js';
import { getAppDb } from '../db/appDb.js';
import * as q from '../db/queries.js';
import { asyncHandler, json, requireClerkUserId, sendError } from '../http/handlers.js';
import { importCodexCatalog } from '../import/codexCatalog.js';

export const accountsRouter = Router();

accountsRouter.use(requireAuthApi);

accountsRouter.get(
  '/',
  asyncHandler((req, res) => {
    const clerkUserId = requireClerkUserId(req);
    const db = getAppDb();
    const accounts = q.listAccounts(db, clerkUserId);
    const current = accounts.find((account) => account.is_active === 1) ?? null;
    json(res, { accounts, current_account_id: current?.id ?? null });
  }),
);

accountsRouter.post(
  '/',
  asyncHandler((req, res) => {
    const clerkUserId = requireClerkUserId(req);
    const name = accountNameSchema.safeParse(req.body?.account_name);
    if (!name.success) {
      sendError(res, 'Account name is required (max 128 characters).');
      return;
    }
    const db = getAppDb();
    const account = q.createAccount(db, clerkUserId, name.data);
    json(res, { account }, 201);
  }),
);

accountsRouter.post(
  '/switch',
  asyncHandler((req, res) => {
    const clerkUserId = requireClerkUserId(req);
    const accountId = accountIdSchema.safeParse(req.body?.account_id);
    if (!accountId.success) {
      sendError(res, 'account_id is required.');
      return;
    }
    const db = getAppDb();
    const account = q.setActiveAccount(db, accountId.data, clerkUserId);
    json(res, { account });
  }),
);

accountsRouter.patch(
  '/:id',
  asyncHandler((req, res) => {
    const clerkUserId = requireClerkUserId(req);
    const accountId = Number(req.params.id);
    const accountName = accountNameSchema.safeParse(req.body?.account_name);
    if (!Number.isInteger(accountId) || accountId <= 0) {
      sendError(res, 'Invalid account id.');
      return;
    }
    if (!accountName.success) {
      sendError(res, 'Account name is required (max 128 characters).');
      return;
    }
    q.renameAccount(getAppDb(), accountId, clerkUserId, accountName.data);
    json(res, { ok: true });
  }),
);

accountsRouter.delete(
  '/:id',
  asyncHandler((req, res) => {
    const clerkUserId = requireClerkUserId(req);
    const accountId = Number(req.params.id);
    if (!Number.isInteger(accountId) || accountId <= 0) {
      sendError(res, 'Invalid account id.');
      return;
    }
    q.deleteAccount(getAppDb(), accountId, clerkUserId);
    json(res, { ok: true });
  }),
);

export const adminRouter = Router();
adminRouter.use(requireAuthApi, requireAdmin);
adminRouter.get(
  '/catalog',
  asyncHandler((_req, res) => {
    json(res, q.catalogStatus(getAppDb()));
  }),
);
adminRouter.post(
  '/import-catalog',
  asyncHandler((_req, res) => {
    const summary = importCodexCatalog();
    json(res, summary);
  }),
);
