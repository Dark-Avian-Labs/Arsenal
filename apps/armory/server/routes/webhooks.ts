import { createClerkWebhookRouter } from '@dark-avian-labs/server-kit';
import type { Router } from 'express';

import { markArmoryUserDeleted, upsertArmoryUser } from '../auth/armoryUsers.ts';
import { CLERK_WEBHOOK_SIGNING_SECRET } from '../config.ts';

export const clerkWebhookRouter: Router = createClerkWebhookRouter({
  signingSecret: () => CLERK_WEBHOOK_SIGNING_SECRET,
  onUserCreated: (data) => {
    const username = typeof data.username === 'string' ? data.username.trim() : '';
    if (username.length > 0) {
      upsertArmoryUser(data.id, username);
    }
  },
  onUserUpdated: (data) => {
    const username = typeof data.username === 'string' ? data.username.trim() : '';
    upsertArmoryUser(data.id, username.length > 0 ? username : null);
  },
  onUserDeleted: (userId) => {
    markArmoryUserDeleted(userId);
  },
});
