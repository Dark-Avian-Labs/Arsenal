import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';

import { APP_NAME } from '../config.js';

export const apiRouter = Router();

apiRouter.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', app: APP_NAME });
});

apiRouter.get('/search', (req: Request, res: Response) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  res.json({
    query,
    items: [],
    message: 'Search endpoint is a scaffold placeholder.',
  });
});

apiRouter.get('/scaffold/info', (_req: Request, res: Response) => {
  res.json({
    app: APP_NAME,
    message: 'AppBase scaffold API is ready.',
  });
});
