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
});
