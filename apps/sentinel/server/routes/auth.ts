import { getClerkAuthState, requireAuthApi } from '@dark-avian-labs/server-kit';
import { Router, type Request, type Response } from 'express';

export const authRouter = Router();

authRouter.get('/me', requireAuthApi, (req: Request, res: Response) => {
  const state = getClerkAuthState(req);
  res.json({
    authenticated: state.authenticated,
    userId: state.userId,
    isAdmin: state.isAdmin,
  });
});
