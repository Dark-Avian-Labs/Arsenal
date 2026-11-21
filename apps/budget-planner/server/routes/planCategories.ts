import { randomUUID } from 'crypto';

import { Router, type Request, type Response } from 'express';

import { nextAccountColor, remapAccountColor } from '../../shared/accountColors.ts';
import { isNonNegativeInteger, normalizeName } from '../../shared/schemas.ts';
import { getAppDb } from '../db/connection.ts';
import { requirePlanAccess } from '../middleware/auth.ts';
import { categoryBelongsToPlan, routeParam, syncPlanOnceEntries } from './planHelpers.ts';

export const planCategoriesRouter = Router();

planCategoriesRouter.post(
  '/:planId/categories',
  requirePlanAccess('editor'),
  (req: Request, res: Response) => {
    const planId = routeParam(req.params.planId);
    const name = normalizeName(req.body?.name);
    if (!name) {
      res.status(400).json({ error: 'Name is required', code: 'invalid_name' });
      return;
    }
    const db = getAppDb();
    const max = db
      .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE plan_id = ?`)
      .get(planId) as { m: number };
    const id = randomUUID();
    db.prepare(`INSERT INTO categories (id, plan_id, name, sort_order) VALUES (?, ?, ?, ?)`).run(
      id,
      planId,
      name,
      max.m + 1,
    );
    const category = db
      .prepare(`SELECT id, plan_id, name, sort_order FROM categories WHERE id = ?`)
      .get(id);
    res.status(201).json({ category });
  },
);

planCategoriesRouter.patch(
  '/:planId/categories/:categoryId',
  requirePlanAccess('editor'),
  (req: Request, res: Response) => {
    const planId = routeParam(req.params.planId);
    const categoryId = routeParam(req.params.categoryId);
    const db = getAppDb();
    const existing = db
      .prepare(`SELECT id, name, sort_order FROM categories WHERE id = ? AND plan_id = ?`)
      .get(categoryId, planId) as { id: string; name: string; sort_order: number } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Category not found', code: 'not_found' });
      return;
    }
    const name = normalizeName(req.body?.name, existing.name);
    if (!name) {
      res.status(400).json({ error: 'Invalid name', code: 'invalid_name' });
      return;
    }
    const sortOrder = isNonNegativeInteger(req.body?.sort_order)
      ? req.body.sort_order
      : existing.sort_order;
    db.prepare(
      `UPDATE categories SET name = ?, sort_order = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(name, sortOrder, categoryId);
    const category = db
      .prepare(`SELECT id, plan_id, name, sort_order FROM categories WHERE id = ?`)
      .get(categoryId);
    res.json({ category });
  },
);

planCategoriesRouter.delete(
  '/:planId/categories/:categoryId',
  requirePlanAccess('editor'),
  (req: Request, res: Response) => {
    const planId = routeParam(req.params.planId);
    const categoryId = routeParam(req.params.categoryId);
    const result = getAppDb()
      .prepare(`DELETE FROM categories WHERE id = ? AND plan_id = ?`)
      .run(categoryId, planId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Category not found', code: 'not_found' });
      return;
    }
    res.status(204).end();
  },
);

planCategoriesRouter.post(
  '/:planId/accounts',
  requirePlanAccess('editor'),
  (req: Request, res: Response) => {
    const planId = routeParam(req.params.planId);
    const name = normalizeName(req.body?.name);
    if (!name) {
      res.status(400).json({ error: 'Name is required', code: 'invalid_name' });
      return;
    }
    const db = getAppDb();
    const existingColors = (
      db.prepare(`SELECT color FROM accounts WHERE plan_id = ?`).all(planId) as Array<{
        color: string;
      }>
    ).map((r) => r.color);
    const color = remapAccountColor(req.body?.color) ?? nextAccountColor(existingColors);
    const max = db
      .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM accounts WHERE plan_id = ?`)
      .get(planId) as { m: number };
    const id = randomUUID();
    db.prepare(
      `INSERT INTO accounts (id, plan_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)`,
    ).run(id, planId, name, color, max.m + 1);
    const account = db
      .prepare(`SELECT id, plan_id, name, color, sort_order FROM accounts WHERE id = ?`)
      .get(id);
    res.status(201).json({ account });
  },
);

planCategoriesRouter.patch(
  '/:planId/accounts/:accountId',
  requirePlanAccess('editor'),
  (req: Request, res: Response) => {
    const planId = routeParam(req.params.planId);
    const accountId = routeParam(req.params.accountId);
    const db = getAppDb();
    const existing = db
      .prepare(`SELECT id, name, color, sort_order FROM accounts WHERE id = ? AND plan_id = ?`)
      .get(accountId, planId) as
      | { id: string; name: string; color: string; sort_order: number }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Account not found', code: 'not_found' });
      return;
    }
    const name = normalizeName(req.body?.name, existing.name);
    if (!name) {
      res.status(400).json({ error: 'Invalid name', code: 'invalid_name' });
      return;
    }
    const sortOrder = isNonNegativeInteger(req.body?.sort_order)
      ? req.body.sort_order
      : existing.sort_order;
    const color = remapAccountColor(req.body?.color) ?? existing.color;
    db.prepare(
      `UPDATE accounts SET name = ?, color = ?, sort_order = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(name, color, sortOrder, accountId);
    const account = db
      .prepare(`SELECT id, plan_id, name, color, sort_order FROM accounts WHERE id = ?`)
      .get(accountId);
    res.json({ account });
  },
);

planCategoriesRouter.delete(
  '/:planId/accounts/:accountId',
  requirePlanAccess('editor'),
  (req: Request, res: Response) => {
    const planId = routeParam(req.params.planId);
    const accountId = routeParam(req.params.accountId);
    const result = getAppDb()
      .prepare(`DELETE FROM accounts WHERE id = ? AND plan_id = ?`)
      .run(accountId, planId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Account not found', code: 'not_found' });
      return;
    }
    res.status(204).end();
  },
);

planCategoriesRouter.post(
  '/:planId/reorder',
  requirePlanAccess('editor'),
  (req: Request, res: Response) => {
    const planId = routeParam(req.params.planId);
    const categories = Array.isArray(req.body?.categories) ? req.body.categories : null;
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : null;
    const db = getAppDb();
    syncPlanOnceEntries(db, planId);

    try {
      const tx = db.transaction(() => {
        if (categories) {
          const stmt = db.prepare(
            `UPDATE categories SET sort_order = ?, updated_at = datetime('now')
             WHERE id = ? AND plan_id = ?`,
          );
          for (const item of categories as Array<{ id: string; sort_order: number }>) {
            if (typeof item.id !== 'string' || !isNonNegativeInteger(item.sort_order)) {
              throw new Error('Invalid category reorder');
            }
            const result = stmt.run(item.sort_order, item.id, planId);
            if (result.changes === 0) throw new Error('Invalid category');
          }
        }
        if (entries) {
          const stmt = db.prepare(
            `UPDATE entries SET sort_order = ?, category_id = COALESCE(?, category_id),
              updated_at = datetime('now') WHERE id = ? AND plan_id = ?`,
          );
          for (const item of entries as Array<{
            id: string;
            sort_order: number;
            category_id?: string;
          }>) {
            if (typeof item.id !== 'string' || !isNonNegativeInteger(item.sort_order)) {
              throw new Error('Invalid entry reorder');
            }
            if (item.category_id && !categoryBelongsToPlan(db, item.category_id, planId)) {
              throw new Error('Invalid category');
            }
            const result = stmt.run(item.sort_order, item.category_id ?? null, item.id, planId);
            if (result.changes === 0) throw new Error('Invalid entry');
          }
        }
      });
      tx();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid reorder';
      res.status(400).json({ error: message, code: 'invalid_reorder' });
      return;
    }
    res.json({ ok: true });
  },
);
