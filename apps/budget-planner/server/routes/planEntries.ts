import { randomUUID } from 'crypto';

import { Router, type Request, type Response } from 'express';

import {
  entryPatchSchema,
  entrySchema,
  fieldErrors,
  invalidFieldsBody,
  isNonNegativeInteger,
  normalizeComment,
  normalizeName,
} from '../../shared/schemas.ts';
import type { EntryFrequency, EntryKind } from '../db/appSchema.ts';
import { getAppDb } from '../db/connection.ts';
import { ENTRY_SELECT, type PlanEntryRow } from '../lib/planEntries.ts';
import { requirePlanAccess } from '../middleware/auth.ts';
import {
  accountBelongsToPlan,
  categoryBelongsToPlan,
  routeParam,
  syncPlanOnceEntries,
} from './planHelpers.ts';

export const planEntriesRouter = Router();

planEntriesRouter.post(
  '/:planId/entries',
  requirePlanAccess('editor'),
  (req: Request, res: Response) => {
    const planId = routeParam(req.params.planId);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const parsedEntry = entrySchema.safeParse(body);
    if (!parsedEntry.success) {
      res.status(400).json(invalidFieldsBody(fieldErrors(parsedEntry.error)));
      return;
    }

    const frequency = body.frequency as EntryFrequency;
    let dueMonth: number | null = typeof body.due_month === 'number' ? body.due_month : null;
    let dueYear: number | null = typeof body.due_year === 'number' ? body.due_year : null;
    if (frequency !== 'monthly' && (dueMonth == null || dueMonth < 1 || dueMonth > 12)) {
      res.status(400).json(invalidFieldsBody(['due_month']));
      return;
    }
    if (frequency === 'monthly') {
      dueMonth = null;
      dueYear = null;
    } else if (frequency === 'once') {
      if (dueYear == null) {
        res.status(400).json(invalidFieldsBody(['due_year']));
        return;
      }
    } else {
      dueYear = null;
    }

    const db = getAppDb();
    if (!categoryBelongsToPlan(db, body.category_id as string, planId)) {
      res.status(400).json({ error: 'Invalid category', code: 'invalid_category' });
      return;
    }

    const accountId =
      typeof body.account_id === 'string' && body.account_id ? body.account_id : null;
    if (accountId && !accountBelongsToPlan(db, accountId, planId)) {
      res.status(400).json({ error: 'Invalid account', code: 'invalid_account' });
      return;
    }

    const comment = normalizeComment(body.comment, null);
    if (body.comment !== undefined && body.comment !== null && comment == null) {
      res.status(400).json(invalidFieldsBody(['comment']));
      return;
    }

    const max = db
      .prepare(
        `SELECT COALESCE(MAX(sort_order), -1) AS m FROM entries WHERE plan_id = ? AND category_id = ?`,
      )
      .get(planId, body.category_id) as { m: number };

    const id = randomUUID();
    db.prepare(
      `INSERT INTO entries (
        id, plan_id, category_id, account_id, name, amount_cents, kind, frequency,
        due_day, due_month, due_year, comment, end_date, final_amount_cents, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      planId,
      body.category_id,
      accountId,
      (body.name as string).trim(),
      body.amount_cents,
      body.kind,
      frequency,
      body.due_day,
      dueMonth,
      dueYear,
      comment,
      typeof body.end_date === 'string' && body.end_date ? body.end_date : null,
      typeof body.final_amount_cents === 'number' ? body.final_amount_cents : null,
      max.m + 1,
    );

    syncPlanOnceEntries(db, planId);
    const entry = db.prepare(`SELECT ${ENTRY_SELECT} FROM entries WHERE id = ?`).get(id);
    res.status(201).json({ entry });
  },
);

planEntriesRouter.patch(
  '/:planId/entries/:entryId',
  requirePlanAccess('editor'),
  (req: Request, res: Response) => {
    const planId = routeParam(req.params.planId);
    const entryId = routeParam(req.params.entryId);
    const db = getAppDb();
    const existing = db
      .prepare(`SELECT ${ENTRY_SELECT} FROM entries WHERE id = ? AND plan_id = ?`)
      .get(entryId, planId) as PlanEntryRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Entry not found', code: 'not_found' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const parsedEntry = entryPatchSchema.safeParse(body);
    if (!parsedEntry.success) {
      res.status(400).json(invalidFieldsBody(fieldErrors(parsedEntry.error)));
      return;
    }

    const name = normalizeName(body.name, existing.name);
    if (!name) {
      res.status(400).json(invalidFieldsBody(['name']));
      return;
    }
    const amountCents = isNonNegativeInteger(body.amount_cents)
      ? body.amount_cents
      : existing.amount_cents;
    const kind = (typeof body.kind === 'string' ? body.kind : existing.kind) as EntryKind;
    const frequency = (
      typeof body.frequency === 'string' ? body.frequency : existing.frequency
    ) as EntryFrequency;
    const dueDay = typeof body.due_day === 'number' ? body.due_day : existing.due_day;
    let dueMonth =
      body.due_month !== undefined ? (body.due_month as number | null) : existing.due_month;
    let dueYear =
      body.due_year !== undefined ? (body.due_year as number | null) : existing.due_year;
    if (frequency === 'monthly') {
      dueMonth = null;
      dueYear = null;
    } else {
      if (dueMonth == null || dueMonth < 1 || dueMonth > 12) {
        res.status(400).json(invalidFieldsBody(['due_month']));
        return;
      }
      if (frequency === 'once') {
        if (dueYear == null) {
          res.status(400).json(invalidFieldsBody(['due_year']));
          return;
        }
      } else {
        dueYear = null;
      }
    }
    const categoryId =
      typeof body.category_id === 'string' && body.category_id
        ? body.category_id
        : existing.category_id;
    if (!categoryBelongsToPlan(db, categoryId, planId)) {
      res.status(400).json({ error: 'Invalid category', code: 'invalid_category' });
      return;
    }
    const accountId =
      body.account_id === null
        ? null
        : typeof body.account_id === 'string'
          ? body.account_id || null
          : existing.account_id;
    if (accountId && !accountBelongsToPlan(db, accountId, planId)) {
      res.status(400).json({ error: 'Invalid account', code: 'invalid_account' });
      return;
    }
    const comment = normalizeComment(body.comment, existing.comment);
    if (body.comment !== undefined && body.comment !== null && comment == null) {
      res.status(400).json(invalidFieldsBody(['comment']));
      return;
    }
    const endDate =
      body.end_date !== undefined
        ? typeof body.end_date === 'string' && body.end_date
          ? body.end_date
          : null
        : existing.end_date;
    const finalAmount =
      body.final_amount_cents !== undefined
        ? isNonNegativeInteger(body.final_amount_cents)
          ? body.final_amount_cents
          : null
        : existing.final_amount_cents;
    const sortOrder = isNonNegativeInteger(body.sort_order) ? body.sort_order : existing.sort_order;

    db.prepare(
      `UPDATE entries SET
        category_id = ?, account_id = ?, name = ?, amount_cents = ?, kind = ?, frequency = ?,
        due_day = ?, due_month = ?, due_year = ?, comment = ?, end_date = ?, final_amount_cents = ?,
        sort_order = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      categoryId,
      accountId,
      name,
      amountCents,
      kind,
      frequency,
      dueDay,
      dueMonth,
      dueYear,
      comment,
      endDate,
      finalAmount,
      sortOrder,
      entryId,
    );

    syncPlanOnceEntries(db, planId);
    const entry = db.prepare(`SELECT ${ENTRY_SELECT} FROM entries WHERE id = ?`).get(entryId);
    res.json({ entry });
  },
);

planEntriesRouter.delete(
  '/:planId/entries/:entryId',
  requirePlanAccess('editor'),
  (req: Request, res: Response) => {
    const planId = routeParam(req.params.planId);
    const entryId = routeParam(req.params.entryId);
    const result = getAppDb()
      .prepare(`DELETE FROM entries WHERE id = ? AND plan_id = ?`)
      .run(entryId, planId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Entry not found', code: 'not_found' });
      return;
    }
    res.status(204).end();
  },
);
