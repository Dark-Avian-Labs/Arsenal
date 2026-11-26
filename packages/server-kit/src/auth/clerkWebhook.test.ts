import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

const webhookMocks = vi.hoisted(() => ({
  verifyWebhook: vi.fn(),
  getSessionList: vi.fn(),
  revokeSession: vi.fn(),
}));

vi.mock('@clerk/express/webhooks', () => ({
  verifyWebhook: webhookMocks.verifyWebhook,
}));

vi.mock('@clerk/express', () => ({
  clerkClient: {
    sessions: {
      getSessionList: webhookMocks.getSessionList,
      revokeSession: webhookMocks.revokeSession,
    },
  },
}));

import { withServer } from '../testing/index.ts';
import {
  createClerkWebhookRouter,
  passwordChangeCutoff,
  revokeSessionsOpenedBefore,
  type ClerkSessionPageClient,
} from './clerkWebhook.ts';

describe('passwordChangeCutoff', () => {
  it('returns a cutoff when the password write matches updated_at', () => {
    expect(passwordChangeCutoff({ password_last_updated_at: 10_000, updated_at: 10_000 })).toBe(8_000);
  });

  it('ignores a later profile edit or missing password timestamp', () => {
    expect(passwordChangeCutoff({ password_last_updated_at: 10_000, updated_at: 20_000 })).toBeNull();
    expect(passwordChangeCutoff({ password_last_updated_at: null, updated_at: 10_000 })).toBeNull();
  });
});

describe('revokeSessionsOpenedBefore', () => {
  it('revokes sessions opened before the password change and keeps the reset session', async () => {
    const revoked: string[] = [];
    const sessions: ClerkSessionPageClient = {
      async getSessionList() {
        return {
          data: [
            { id: 'sess_reset', createdAt: 9_500 },
            { id: 'sess_other_browser', createdAt: 1_000 },
          ],
        };
      },
      async revokeSession(id) {
        revoked.push(id);
      },
    };

    const count = await revokeSessionsOpenedBefore(sessions, 'user_1', 8_000);

    expect(count).toBe(1);
    expect(revoked).toEqual(['sess_other_browser']);
  });

  it('collects every page before revoking so pagination offsets do not skip sessions', async () => {
    const active = Array.from({ length: 120 }, (_, i) => ({
      id: `sess_${i}`,
      createdAt: i === 119 ? 9_500 : 1_000,
    }));
    const revoked: string[] = [];
    const sessions: ClerkSessionPageClient = {
      async getSessionList({ limit, offset }) {
        return { data: active.slice(offset, offset + limit) };
      },
      async revokeSession(id) {
        const idx = active.findIndex((s) => s.id === id);
        if (idx >= 0) active.splice(idx, 1);
        revoked.push(id);
      },
    };

    const count = await revokeSessionsOpenedBefore(sessions, 'user_1', 8_000);

    expect(count).toBe(119);
    expect(revoked).toHaveLength(119);
    expect(active.map((s) => s.id)).toEqual(['sess_119']);
  });
});

describe('createClerkWebhookRouter', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeApp(opts: Parameters<typeof createClerkWebhookRouter>[0]) {
    const app = express();
    app.use('/webhook', express.raw({ type: 'application/json' }), createClerkWebhookRouter(opts));
    return app;
  }

  it('returns 500 when signingSecret is missing and 400 when verification fails', async () => {
    await withServer(makeApp({ signingSecret: () => '   ' }), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(res.status).toBe(500);
    });

    webhookMocks.verifyWebhook.mockRejectedValueOnce(new Error('bad sig'));
    await withServer(makeApp({ signingSecret: () => 'whsec_test' }), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(res.status).toBe(400);
    });
  });

  it('dispatches user.created, user.updated (with password-change revoke), and user.deleted', async () => {
    const onUserCreated = vi.fn();
    const onUserUpdated = vi.fn();
    const onUserDeleted = vi.fn();
    webhookMocks.getSessionList.mockResolvedValue({
      data: [
        { id: 'sess_old', createdAt: 1_000 },
        { id: 'sess_new', createdAt: 9_500 },
      ],
    });
    webhookMocks.revokeSession.mockResolvedValue(undefined);

    const app = makeApp({
      signingSecret: () => 'whsec_test',
      onUserCreated,
      onUserUpdated,
      onUserDeleted,
    });

    await withServer(app, async (baseUrl) => {
      webhookMocks.verifyWebhook.mockResolvedValueOnce({
        type: 'user.created',
        data: { id: 'user_1', username: ' tenno ' },
      });
      const r1 = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(r1.status).toBe(200);
      expect(onUserCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'user_1', username: 'tenno' }));

      webhookMocks.verifyWebhook.mockResolvedValueOnce({
        type: 'user.updated',
        data: {
          id: 'user_1',
          username: '  ',
          password_last_updated_at: 10_000,
          updated_at: 10_000,
        },
      });
      const r2 = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(r2.status).toBe(200);
      expect(onUserUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: 'user_1', username: null }));
      expect(webhookMocks.revokeSession).toHaveBeenCalledWith('sess_old');
      expect(webhookMocks.revokeSession).not.toHaveBeenCalledWith('sess_new');

      webhookMocks.verifyWebhook.mockResolvedValueOnce({
        type: 'user.deleted',
        data: { id: 'user_1' },
      });
      const r3 = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(r3.status).toBe(200);
      expect(onUserDeleted).toHaveBeenCalledWith('user_1');
    });
  });
});
