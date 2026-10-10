import { Router, type Request, type Response } from 'express';

import { APP_NAME } from '../config.ts';
import { accountsRouter, adminRouter } from './accounts.ts';
import { artifactsRouter } from './artifacts.ts';
import { authRouter } from './auth.ts';
import { gearRouter } from './gear.ts';
import { heroesRouter } from './heroes.ts';
import { outfitRouter } from './outfit.ts';

export const apiRouter = Router();

apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', app: APP_NAME });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/accounts', accountsRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/gear', gearRouter);
apiRouter.use('/artifacts', artifactsRouter);
apiRouter.use('/heroes', heroesRouter);
apiRouter.use('/outfit', outfitRouter);
