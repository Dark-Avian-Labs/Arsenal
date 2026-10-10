import { Router, type Request, type Response } from 'express';

import { APP_NAME } from '../config.ts';
import { authRouter } from './auth.ts';

export const apiRouter = Router();

apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', app: APP_NAME });
});

apiRouter.use('/auth', authRouter);
