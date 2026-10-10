import { Router, type Request, type Response } from 'express';

import { APP_NAME } from '../config.js';
import { fleetRouter } from '../metrics/fleetRoute.js';
import { authRouter } from './auth.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', app: APP_NAME });
});

apiRouter.get('/csrf', (req: Request, res: Response) => {
  const generate = req.app.locals.generateCsrfToken as ((request: Request) => string) | undefined;
  const token = generate ? generate(req) : (req.session.csrfToken ?? '');
  res.setHeader('Cache-Control', 'no-store');
  res.json({ csrfToken: token });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/fleet', fleetRouter);
