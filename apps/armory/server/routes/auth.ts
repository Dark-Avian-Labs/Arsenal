import { Router, type NextFunction } from 'express';

import { hasActiveArmoryUser, syncArmoryUserFromClerk } from '../auth/armoryUsers.ts';
import { getClerkAuthState, requireAuthApi } from '../auth/middleware.ts';

export const authRouter: Router = Router();

authRouter.get('/me', requireAuthApi, async (req, res, next: NextFunction) => {
  try {
    const state = getClerkAuthState(req);
    if (!state.authenticated || !state.userId) {
      res.json({
        authenticated: false,
        userId: null,
        isAdmin: false,
        isArmoryAdmin: false,
      });
      return;
    }
    if (!hasActiveArmoryUser(state.userId)) {
      await syncArmoryUserFromClerk(state.userId);
    }
    res.json({
      authenticated: true,
      userId: state.userId,
      isAdmin: state.isArmoryAdmin,
      isArmoryAdmin: state.isArmoryAdmin,
    });
  } catch (err) {
    next(err);
  }
});
