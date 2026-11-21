import { clerkClient } from '@clerk/express';
import { verifyWebhook, type WebhookEvent } from '@clerk/express/webhooks';
import { Router, type Request, type Response } from 'express';

import { log } from '../logger.ts';

const PASSWORD_WRITE_WINDOW_MS = 5_000;
const RESET_SESSION_SKEW_MS = 2_000;
const SESSION_PAGE = 100;

export type ClerkUserWebhookPayload = {
  id: string;
  username: string | null;
  raw: Record<string, unknown>;
};

export type ClerkWebhookHandlers = {
  signingSecret: () => string;
  onUserCreated?: (user: ClerkUserWebhookPayload) => void | Promise<void>;
  onUserUpdated?: (user: ClerkUserWebhookPayload) => void | Promise<void>;
  onUserDeleted?: (userId: string) => void | Promise<void>;
  revokeOnPasswordChange?: boolean;
};

type PasswordTimestamps = {
  password_last_updated_at?: number | null;
  updated_at?: number | null;
};

export type ClerkSessionPageClient = {
  getSessionList: (params: {
    userId: string;
    status: 'active';
    limit: number;
    offset: number;
  }) => Promise<{ data: Array<{ id: string; createdAt: number }> }>;
  revokeSession: (sessionId: string) => Promise<unknown>;
};

export function passwordChangeCutoff(user: PasswordTimestamps): number | null {
  const passwordAt = user.password_last_updated_at;
  const updatedAt = user.updated_at;
  if (typeof passwordAt !== 'number' || typeof updatedAt !== 'number') return null;
  if (Math.abs(updatedAt - passwordAt) > PASSWORD_WRITE_WINDOW_MS) return null;
  return passwordAt - RESET_SESSION_SKEW_MS;
}

export async function revokeSessionsOpenedBefore(
  sessions: ClerkSessionPageClient,
  userId: string,
  cutoff: number,
): Promise<number> {
  const list = await sessions.getSessionList({
    userId,
    status: 'active',
    limit: SESSION_PAGE,
    offset: 0,
  });
  if (list.data.length === SESSION_PAGE) {
    log('warn', 'Password change session revoke scanned only the first page', {
      userId,
      limit: SESSION_PAGE,
    });
  }
  let revoked = 0;
  for (const session of list.data) {
    if (session.createdAt >= cutoff) continue;
    await sessions.revokeSession(session.id);
    revoked += 1;
  }
  return revoked;
}

function readUserPayload(event: WebhookEvent): ClerkUserWebhookPayload | null {
  const data = event.data as Record<string, unknown> | null | undefined;
  if (!data || typeof data.id !== 'string' || data.id.trim().length === 0) {
    return null;
  }
  const username =
    typeof data.username === 'string' && data.username.trim() ? data.username.trim() : null;
  return { id: data.id, username, raw: data };
}

export function createClerkWebhookRouter(handlers: ClerkWebhookHandlers): Router {
  const router = Router();
  const revokeOnPasswordChange = handlers.revokeOnPasswordChange ?? true;

  router.post('/', async (req: Request, res: Response) => {
    const signingSecret = handlers.signingSecret().trim();
    if (!signingSecret) {
      res.status(500).json({ error: 'Webhook signing secret not configured' });
      return;
    }

    let event: WebhookEvent;
    try {
      event = await verifyWebhook(req, { signingSecret });
    } catch (err) {
      log('warn', 'Clerk webhook verification failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(400).json({ error: 'Webhook verification failed' });
      return;
    }

    try {
      switch (event.type) {
        case 'user.created': {
          const user = readUserPayload(event);
          if (user) await handlers.onUserCreated?.(user);
          break;
        }
        case 'user.updated': {
          const user = readUserPayload(event);
          if (!user) break;
          await handlers.onUserUpdated?.(user);
          if (revokeOnPasswordChange) {
            const cutoff = passwordChangeCutoff(user.raw as PasswordTimestamps);
            if (cutoff !== null) {
              const revoked = await revokeSessionsOpenedBefore(
                clerkClient.sessions,
                user.id,
                cutoff,
              );
              if (revoked > 0) {
                log('info', 'Revoked sessions opened before a password change', {
                  userId: user.id,
                  count: revoked,
                });
              }
            }
          }
          break;
        }
        case 'user.deleted': {
          const user = readUserPayload(event);
          if (user) await handlers.onUserDeleted?.(user.id);
          break;
        }
        default:
          break;
      }
      res.json({ ok: true });
    } catch (err) {
      log('error', 'Clerk webhook processing failed', {
        eventType: event.type,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  return router;
}
