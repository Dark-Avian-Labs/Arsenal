import { getAuth } from '@clerk/express';
import { isClerkConfigured } from '@dark-avian-labs/server-kit';
import type { Request } from 'express';

export function getClerkUserId(req: Request): string | null {
  if (!isClerkConfigured()) return null;
  return getAuth(req).userId ?? null;
}
