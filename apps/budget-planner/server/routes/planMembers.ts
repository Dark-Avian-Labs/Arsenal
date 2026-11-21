import { randomUUID } from 'crypto';

import { Router, type Request, type Response } from 'express';

import type { MemberRole } from '../db/appSchema.ts';
import { getAppDb } from '../db/connection.ts';
import { requireAuth, requirePlanAccess } from '../middleware/auth.ts';
import { createInviteToken, getMembership, updateUserPreferences } from '../services/users.ts';
import { clearDefaultPlan, routeParam } from './planHelpers.ts';

export const planMembersRouter = Router();

planMembersRouter.post(
  '/:planId/leave',
  requirePlanAccess('viewer'),
  (req: Request, res: Response) => {
    const planId = routeParam(req.params.planId);
    const user = req.appUser!;
    const role = (res.locals as { planRole?: MemberRole }).planRole;
    if (role === 'owner') {
      res.status(400).json({
        error: 'Owner cannot leave the plan. Delete it instead.',
        code: 'owner_cannot_leave',
      });
      return;
    }

    const db = getAppDb();
    const tx = db.transaction(() => {
      clearDefaultPlan(db, user.id, planId);
      db.prepare(`DELETE FROM plan_members WHERE plan_id = ? AND user_id = ?`).run(planId, user.id);
    });
    tx();
    res.status(204).end();
  },
);

planMembersRouter.delete(
  '/:planId/members/:userId',
  requirePlanAccess('owner'),
  (req: Request, res: Response) => {
    const planId = routeParam(req.params.planId);
    const userId = routeParam(req.params.userId);
    const db = getAppDb();
    const membership = getMembership(planId, userId);
    if (!membership) {
      res.status(404).json({ error: 'Member not found', code: 'not_found' });
      return;
    }
    if (membership.role === 'owner') {
      res.status(400).json({ error: 'Cannot remove the plan owner', code: 'cannot_remove_owner' });
      return;
    }

    const tx = db.transaction(() => {
      clearDefaultPlan(db, userId, planId);
      db.prepare(`DELETE FROM plan_members WHERE plan_id = ? AND user_id = ?`).run(planId, userId);
    });
    tx();
    res.status(204).end();
  },
);

planMembersRouter.delete(
  '/:planId/invites/:inviteId',
  requirePlanAccess('owner'),
  (req: Request, res: Response) => {
    const planId = routeParam(req.params.planId);
    const inviteId = routeParam(req.params.inviteId);
    const result = getAppDb()
      .prepare(`DELETE FROM plan_invites WHERE id = ? AND plan_id = ? AND accepted_at IS NULL`)
      .run(inviteId, planId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Invite not found', code: 'not_found' });
      return;
    }
    res.status(204).end();
  },
);

planMembersRouter.post(
  '/:planId/invites',
  requirePlanAccess('owner'),
  (req: Request, res: Response) => {
    const planId = routeParam(req.params.planId);
    const user = req.appUser!;
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const role = req.body?.role === 'editor' ? 'editor' : 'viewer';
    if (!email || !email.includes('@') || email.length > 254) {
      res.status(400).json({ error: 'Valid email is required', code: 'invalid_email' });
      return;
    }

    const existingMember = getAppDb()
      .prepare(
        `SELECT pm.role FROM plan_members pm
         JOIN users u ON u.id = pm.user_id
         WHERE pm.plan_id = ? AND lower(u.email) = ?`,
      )
      .get(planId, email) as { role: string } | undefined;
    if (existingMember) {
      res.status(409).json({
        error: 'That email already belongs to a plan member',
        code: 'email_already_member',
      });
      return;
    }

    const token = createInviteToken();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const db = getAppDb();

    const pending = db
      .prepare(
        `SELECT id FROM plan_invites
         WHERE plan_id = ? AND lower(email) = ? AND accepted_at IS NULL`,
      )
      .get(planId, email) as { id: string } | undefined;

    let id: string;
    let created = false;
    if (pending) {
      id = pending.id;
      db.prepare(
        `UPDATE plan_invites
         SET role = ?, token = ?, invited_by = ?, expires_at = ?
         WHERE id = ?`,
      ).run(role, token, user.id, expiresAt, id);
    } else {
      id = randomUUID();
      db.prepare(
        `INSERT INTO plan_invites (id, plan_id, email, role, token, invited_by, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, planId, email, role, token, user.id, expiresAt);
      created = true;
    }

    const plan = db.prepare(`SELECT name FROM plans WHERE id = ?`).get(planId) as {
      name: string;
    };

    res.status(created ? 201 : 200).json({
      invite: {
        id,
        email,
        role,
        token,
        expiresAt,
        acceptPath: `/invite/${token}`,
      },
      mailto: {
        to: email,
        subject: `Join "${plan.name}" on BudgetPlanner`,
        body: `You've been invited to ${role === 'editor' ? 'edit' : 'view'} the budget plan "${plan.name}".\n\nOpen this link after signing in:\n`,
      },
    });
  },
);

export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get('/', (req: Request, res: Response) => {
  const user = req.appUser!;
  res.json({
    id: user.id,
    email: user.email,
    locale: user.locale,
    defaultPlanId: user.default_plan_id,
  });
});

meRouter.patch('/', (req: Request, res: Response) => {
  const user = req.appUser!;
  const locale =
    typeof req.body?.locale === 'string' && ['en', 'de'].includes(req.body.locale)
      ? req.body.locale
      : undefined;
  let defaultPlanId: string | null | undefined = undefined;
  if (req.body?.defaultPlanId === null) defaultPlanId = null;
  else if (typeof req.body?.defaultPlanId === 'string') {
    const membership = getMembership(req.body.defaultPlanId, user.id);
    if (!membership) {
      res.status(400).json({ error: 'Not a member of that plan' });
      return;
    }
    defaultPlanId = req.body.defaultPlanId;
  }

  const updated = updateUserPreferences(user.id, {
    locale,
    default_plan_id: defaultPlanId,
  });
  res.json({
    id: updated.id,
    email: updated.email,
    locale: updated.locale,
    defaultPlanId: updated.default_plan_id,
  });
});

export const invitesRouter = Router();

invitesRouter.get('/:token', requireAuth, (req: Request, res: Response) => {
  const token = routeParam(req.params.token);
  const row = getAppDb()
    .prepare(
      `SELECT i.role, i.expires_at, i.accepted_at, p.name AS plan_name, p.currency
       FROM plan_invites i
       JOIN plans p ON p.id = i.plan_id
       WHERE i.token = ?`,
    )
    .get(token) as
    | {
        role: 'editor' | 'viewer';
        expires_at: string;
        accepted_at: string | null;
        plan_name: string;
        currency: string;
      }
    | undefined;

  if (!row) {
    res.status(404).json({ error: 'Invite not found', code: 'invite_not_found' });
    return;
  }
  if (row.accepted_at) {
    res.status(410).json({ error: 'Invite already accepted', code: 'invite_already_accepted' });
    return;
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    res.status(410).json({ error: 'Invite expired', code: 'invite_expired' });
    return;
  }

  res.json({
    role: row.role,
    planName: row.plan_name,
    currency: row.currency,
    expiresAt: row.expires_at,
  });
});

invitesRouter.post('/:token/accept', requireAuth, (req: Request, res: Response) => {
  const token = routeParam(req.params.token);
  const user = req.appUser!;
  const db = getAppDb();

  const invite = db
    .prepare(
      `SELECT id, plan_id, email, role, expires_at, accepted_at FROM plan_invites WHERE token = ?`,
    )
    .get(token) as
    | {
        id: string;
        plan_id: string;
        email: string;
        role: 'editor' | 'viewer';
        expires_at: string;
        accepted_at: string | null;
      }
    | undefined;

  if (!invite) {
    res.status(404).json({ error: 'Invite not found', code: 'invite_not_found' });
    return;
  }
  if (invite.accepted_at) {
    res.status(410).json({ error: 'Invite already accepted', code: 'invite_already_accepted' });
    return;
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    res.status(410).json({ error: 'Invite expired', code: 'invite_expired' });
    return;
  }
  if (user.email.trim().toLowerCase() !== invite.email.trim().toLowerCase()) {
    res.status(403).json({
      error: 'Invite email does not match your account',
      code: 'invite_email_mismatch',
    });
    return;
  }

  const setDefault = Boolean(req.body?.setAsDefault);

  const tx = db.transaction(() => {
    const existing = db
      .prepare(`SELECT role FROM plan_members WHERE plan_id = ? AND user_id = ?`)
      .get(invite.plan_id, user.id) as { role: string } | undefined;
    if (existing?.role === 'owner') {
      throw new Error('OWNER_INVITE');
    }

    db.prepare(
      `INSERT INTO plan_members (plan_id, user_id, role)
       VALUES (?, ?, ?)
       ON CONFLICT(plan_id, user_id) DO UPDATE SET role = excluded.role
       WHERE plan_members.role != 'owner'`,
    ).run(invite.plan_id, user.id, invite.role);

    db.prepare(`UPDATE plan_invites SET accepted_at = datetime('now') WHERE id = ?`).run(invite.id);

    if (setDefault || !user.default_plan_id) {
      db.prepare(
        `UPDATE users SET default_plan_id = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(invite.plan_id, user.id);
    }
  });
  try {
    tx();
  } catch (err) {
    if (err instanceof Error && err.message === 'OWNER_INVITE') {
      res.status(409).json({
        error: 'Plan owners cannot accept an invite that would change their role',
        code: 'already_member',
      });
      return;
    }
    throw err;
  }

  res.json({
    planId: invite.plan_id,
    role: invite.role,
    setAsDefault: setDefault || !user.default_plan_id,
  });
});
