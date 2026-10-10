import type { Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import request from 'supertest';

export const testRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
});

export function createSessionAgent(app: Express) {
  return request.agent(app);
}
