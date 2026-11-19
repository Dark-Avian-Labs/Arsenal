import { log } from '@dark-avian-labs/server-kit';

// A profile edit bumps updated_at and leaves password_last_updated_at alone.
const PASSWORD_WRITE_WINDOW_MS = 5_000;

// ponytail: sessions created in the 2s before the password write are kept so a
// reset can finish signing in. A stolen session opened in that window survives.
// Drop the skew if that window is too loose.
const RESET_SESSION_SKEW_MS = 2_000;

// ponytail: one page. A user with more than 100 active sessions keeps the rest.
// Page with offset if that shows up.
const SESSION_PAGE = 100;

type PasswordTimestamps = {
  password_last_updated_at?: number | null;
  updated_at?: number | null;
};

export type SessionPage = {
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
  sessions: SessionPage,
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
