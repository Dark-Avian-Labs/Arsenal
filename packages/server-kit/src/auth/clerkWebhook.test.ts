import { describe, expect, it } from 'vitest';

import { passwordChangeCutoff, revokeSessionsOpenedBefore, type ClerkSessionPageClient } from './clerkWebhook.ts';

describe('passwordChangeCutoff', () => {
  it('returns a cutoff when the password write matches updated_at', () => {
    expect(passwordChangeCutoff({ password_last_updated_at: 10_000, updated_at: 10_000 })).toBe(8_000);
  });

  it('ignores a later profile edit', () => {
    expect(passwordChangeCutoff({ password_last_updated_at: 10_000, updated_at: 20_000 })).toBeNull();
  });

  it('ignores a user with no password timestamp', () => {
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
