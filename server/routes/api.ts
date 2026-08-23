import { Router, type Request, type Response } from 'express';

import { APP_NAME } from '../config.js';
import { authRouter } from './auth.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', app: APP_NAME });
});

apiRouter.get('/csrf', (req: Request, res: Response) => {
  const token = (res.locals as { csrfToken?: string }).csrfToken ?? req.session.csrfToken;
  res.json({ csrfToken: token ?? '' });
});

apiRouter.use('/auth', authRouter);
