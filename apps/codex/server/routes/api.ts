import { Router } from 'express';

import { requireAuthApi } from '../core.ts';
import { epic7ApiRouter } from './epic7Api.ts';
import { warframeApiRouter } from './warframeApi.ts';
import { worAdminApiRouter } from './worAdminApi.ts';
import { worApiRouter } from './worApi.ts';

export const apiRouter = Router();

apiRouter.get('/status', requireAuthApi, (_req, res) => {
  res.json({ ok: true, app: 'codex' });
});

apiRouter.use('/warframe', requireAuthApi, warframeApiRouter);
apiRouter.use('/epic7', requireAuthApi, epic7ApiRouter);
apiRouter.use('/wor/admin', requireAuthApi, worAdminApiRouter);
apiRouter.use('/wor', requireAuthApi, worApiRouter);
