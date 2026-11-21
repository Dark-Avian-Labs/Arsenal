import type { Request } from 'express';

import { calendarMonth, clampPlanMonth } from '../../shared/planMonth.ts';
import type { MemberRole } from '../db/appSchema.ts';
import type { getAppDb } from '../db/connection.ts';
import { syncOnceArchiveState } from '../lib/planEntries.ts';

export interface PlanRow {
  id: string;
  name: string;
  currency: string;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface CategoryRow {
  id: string;
  plan_id: string;
  name: string;
  sort_order: number;
}

export interface AccountRow {
  id: string;
  plan_id: string;
  name: string;
  color: string;
  sort_order: number;
}

export interface MemberRow {
  id: string;
  email: string;
  role: MemberRole;
}

export interface InviteRow {
  id: string;
  email: string;
  role: 'editor' | 'viewer';
  expires_at: string;
}

export function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export function parseMonthQuery(req: Request): { year: number; month: number } {
  const fallback = calendarMonth();
  const rawYear = Number(req.query.year);
  const rawMonth = Number(req.query.month);
  return clampPlanMonth(
    Number.isInteger(rawYear) ? rawYear : fallback.year,
    Number.isInteger(rawMonth) ? rawMonth : fallback.month,
    fallback,
  );
}

export function syncPlanOnceEntries(db: ReturnType<typeof getAppDb>, planId: string): void {
  const now = calendarMonth();
  syncOnceArchiveState(db, planId, now.year, now.month);
}

export function categoryBelongsToPlan(
  db: ReturnType<typeof getAppDb>,
  categoryId: string,
  planId: string,
): boolean {
  return Boolean(
    db.prepare(`SELECT id FROM categories WHERE id = ? AND plan_id = ?`).get(categoryId, planId),
  );
}

export function accountBelongsToPlan(
  db: ReturnType<typeof getAppDb>,
  accountId: string,
  planId: string,
): boolean {
  return Boolean(
    db.prepare(`SELECT id FROM accounts WHERE id = ? AND plan_id = ?`).get(accountId, planId),
  );
}

export function listMembers(db: ReturnType<typeof getAppDb>, planId: string): MemberRow[] {
  return db
    .prepare(
      `SELECT u.id, u.email, pm.role
       FROM plan_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.plan_id = ?
       ORDER BY pm.role, u.email COLLATE NOCASE`,
    )
    .all(planId) as MemberRow[];
}

export function listPendingInvites(db: ReturnType<typeof getAppDb>, planId: string): InviteRow[] {
  return db
    .prepare(
      `SELECT id, email, role, expires_at
       FROM plan_invites
       WHERE plan_id = ? AND accepted_at IS NULL AND julianday(expires_at) > julianday('now')
       ORDER BY created_at DESC`,
    )
    .all(planId) as InviteRow[];
}

export function clearDefaultPlan(
  db: ReturnType<typeof getAppDb>,
  userId: string,
  planId: string,
): void {
  db.prepare(
    `UPDATE users SET default_plan_id = NULL, updated_at = datetime('now')
     WHERE id = ? AND default_plan_id = ?`,
  ).run(userId, planId);
}
