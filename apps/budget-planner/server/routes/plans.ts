import { Router, type Request, type Response } from 'express';

import { computeMonthTotals } from '../../shared/dueThisMonth.ts';
import { fieldErrors, planSchema } from '../../shared/schemas.ts';
import type { MemberRole } from '../db/appSchema.ts';
import { getAppDb } from '../db/connection.ts';
import { listPlanEntries } from '../lib/planEntries.ts';
import { requireAuth, requirePlanAccess } from '../middleware/auth.ts';
import { createPlanForOwner } from '../services/users.ts';
import { planCategoriesRouter } from './planCategories.ts';
import { planEntriesRouter } from './planEntries.ts';
import {
  listMembers,
  listPendingInvites,
  parseMonthQuery,
  routeParam,
  syncPlanOnceEntries,
  type AccountRow,
  type CategoryRow,
  type PlanRow,
} from './planHelpers.ts';
import { invitesRouter, meRouter, planMembersRouter } from './planMembers.ts';

export { invitesRouter, meRouter };

export const plansRouter = Router();

plansRouter.use(requireAuth);

plansRouter.get('/', (req: Request, res: Response) => {
  const user = req.appUser!;
  const db = getAppDb();
  const plans = db
    .prepare(
      `SELECT p.id, p.name, p.currency, p.owner_user_id, p.created_at, p.updated_at, pm.role
       FROM plans p
       JOIN plan_members pm ON pm.plan_id = p.id
       WHERE pm.user_id = ?
       ORDER BY p.name COLLATE NOCASE`,
    )
    .all(user.id) as Array<PlanRow & { role: MemberRole }>;

  res.json({
    plans,
    defaultPlanId: user.default_plan_id,
    me: {
      id: user.id,
      email: user.email,
      locale: user.locale,
      defaultPlanId: user.default_plan_id,
    },
  });
});

plansRouter.post('/', (req: Request, res: Response) => {
  const user = req.appUser!;
  const rawName = req.body?.name;
  const rawCurrency = req.body?.currency;
  const parsed = planSchema.safeParse({
    name: typeof rawName === 'string' && rawName.trim() ? rawName : 'Household',
    currency: rawCurrency == null || rawCurrency === '' ? 'EUR' : rawCurrency,
  });
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    res
      .status(400)
      .json(
        fields.includes('name')
          ? { error: 'Invalid plan name', code: 'invalid_name' }
          : { error: 'Invalid currency', code: 'invalid_currency' },
      );
    return;
  }
  const { name, currency } = parsed.data;

  const planId = createPlanForOwner(user, name, currency);
  const plan = getAppDb()
    .prepare(
      `SELECT id, name, currency, owner_user_id, created_at, updated_at FROM plans WHERE id = ?`,
    )
    .get(planId) as PlanRow;

  res.status(201).json({ plan, role: 'owner' as const });
});

plansRouter.get('/:planId', requirePlanAccess('viewer'), (req: Request, res: Response) => {
  const planId = routeParam(req.params.planId);
  const db = getAppDb();
  const plan = db
    .prepare(
      `SELECT id, name, currency, owner_user_id, created_at, updated_at FROM plans WHERE id = ?`,
    )
    .get(planId) as PlanRow | undefined;
  if (!plan) {
    res.status(404).json({ error: 'Plan not found', code: 'not_found' });
    return;
  }

  const includeArchived = req.query.includeArchived === '1';
  const { year, month } = parseMonthQuery(req);
  syncPlanOnceEntries(db, planId);
  const categories = db
    .prepare(
      `SELECT id, plan_id, name, sort_order FROM categories WHERE plan_id = ? ORDER BY sort_order, name`,
    )
    .all(planId) as CategoryRow[];

  const accounts = db
    .prepare(
      `SELECT id, plan_id, name, color, sort_order FROM accounts WHERE plan_id = ? ORDER BY sort_order, name`,
    )
    .all(planId) as AccountRow[];

  const entries = listPlanEntries(db, planId, year, month, includeArchived);
  const totals = computeMonthTotals(entries, year, month);
  const archivedEntryCounts: Record<string, number> = {};
  const counts = db
    .prepare(
      `SELECT category_id, COUNT(*) AS n FROM entries WHERE plan_id = ? GROUP BY category_id`,
    )
    .all(planId) as Array<{ category_id: string; n: number }>;
  for (const row of counts) archivedEntryCounts[row.category_id] = row.n;
  for (const entry of entries) archivedEntryCounts[entry.category_id]!--;
  const role = (res.locals as { planRole?: MemberRole }).planRole!;
  const members = listMembers(db, planId);

  res.json({
    plan,
    role,
    categories,
    archivedEntryCounts,
    accounts,
    entries,
    totals,
    month: { year, month },
    members,
    pendingInvites: role === 'owner' ? listPendingInvites(db, planId) : [],
  });
});

plansRouter.patch('/:planId', requirePlanAccess('editor'), (req: Request, res: Response) => {
  const planId = routeParam(req.params.planId);
  const db = getAppDb();
  const plan = db.prepare(`SELECT id, name, currency FROM plans WHERE id = ?`).get(planId) as
    | { id: string; name: string; currency: string }
    | undefined;
  if (!plan) {
    res.status(404).json({ error: 'Plan not found', code: 'not_found' });
    return;
  }

  const rawCurrency = req.body?.currency;
  const parsed = planSchema.safeParse({
    name: req.body?.name === undefined ? plan.name : req.body.name,
    currency: rawCurrency == null || rawCurrency === '' ? plan.currency : rawCurrency,
  });
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    res
      .status(400)
      .json(
        fields.includes('name')
          ? { error: 'Invalid plan name', code: 'invalid_name' }
          : { error: 'Invalid currency', code: 'invalid_currency' },
      );
    return;
  }
  const { name, currency } = parsed.data;

  db.prepare(
    `UPDATE plans SET name = ?, currency = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(name, currency, planId);

  const updated = db
    .prepare(
      `SELECT id, name, currency, owner_user_id, created_at, updated_at FROM plans WHERE id = ?`,
    )
    .get(planId);
  res.json({ plan: updated });
});

plansRouter.delete('/:planId', requirePlanAccess('owner'), (req: Request, res: Response) => {
  const planId = routeParam(req.params.planId);
  const db = getAppDb();
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE users SET default_plan_id = NULL, updated_at = datetime('now') WHERE default_plan_id = ?`,
    ).run(planId);
    const result = db.prepare(`DELETE FROM plans WHERE id = ?`).run(planId);
    return result.changes;
  });
  if (tx() === 0) {
    res.status(404).json({ error: 'Plan not found', code: 'not_found' });
    return;
  }
  res.status(204).end();
});

plansRouter.use(planMembersRouter);
plansRouter.use(planCategoriesRouter);
plansRouter.use(planEntriesRouter);
